import { requireApiKey, json, onlyMethods } from './_lib/auth.js';
import { getBody } from './_lib/request.js';
import { fetchRecentReplies, getInboxAccounts } from './_lib/mailbox.js';
import {
  classifyReplyText,
  findJobByOutboundMessageId,
  isReplyProcessed,
  markReplyProcessed,
  normalizeMessageId,
  updateFixJob
} from './_lib/fix-jobs.js';
import { sendTelegramFixUpdate } from './_lib/telegram.js';

function collectReferenceIds(reply) {
  const values = [reply.inReplyTo, ...(reply.references || [])]
    .flat()
    .filter(Boolean)
    .map((v) => normalizeMessageId(v));
  return [...new Set(values.filter(Boolean))];
}

export default async function handler(req, res) {
  if (!onlyMethods(req, res, ['GET', 'POST'])) return;

  const auth = requireApiKey(req);
  if (!auth.ok) return json(res, auth.status, { ok: false, error: auth.error });

  let body = {};
  if (req.method === 'POST') {
    try {
      body = await getBody(req);
    } catch (e) {
      return json(res, 400, { ok: false, error: e.message });
    }
  }

  const maxPerInbox = Number(body.max || req.query?.max || 10);
  const dryRun = String(body.dryRun || req.query?.dryRun || '').toLowerCase() === 'true';

  try {
    const accounts = await getInboxAccounts();
    const summary = [];
    let matched = 0;
    let notified = 0;

    for (const account of accounts) {
      const replies = await fetchRecentReplies(account, { max: maxPerInbox });
      let inboxMatched = 0;

      for (const reply of replies) {
        if (!reply.messageId) continue;
        if (await isReplyProcessed(reply.messageId)) continue;

        const refs = collectReferenceIds(reply);
        let job = null;
        for (const ref of refs) {
          job = await findJobByOutboundMessageId(ref);
          if (job) break;
        }
        if (!job) continue;

        inboxMatched += 1;
        matched += 1;

        const status = classifyReplyText(reply.text);
        const patch = {
          status,
          replyMessageId: reply.messageId,
          replySnippet: String(reply.text || '').slice(0, 500),
          replyFrom: reply.from,
          replyDate: reply.date,
          lastReplyInbox: reply.inboxEmail,
          notified: false
        };

        if (!dryRun) {
          const updated = await updateFixJob(job.fixId, patch);
          await sendTelegramFixUpdate(updated, status, {
            replyFrom: reply.from,
            replyDate: reply.date,
            replySnippet: patch.replySnippet
          });
          await updateFixJob(job.fixId, { notified: true, notifiedAt: new Date().toISOString() });
          await markReplyProcessed(reply.messageId);
          notified += 1;
        }
      }

      summary.push({
        inbox: account.email,
        checked: replies.length,
        matched: inboxMatched
      });
    }

    return json(res, 200, {
      ok: true,
      dryRun,
      inboxes: summary,
      matched,
      notified
    });
  } catch (e) {
    return json(res, 500, { ok: false, error: e.message });
  }
}
