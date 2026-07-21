export type ReplyDraft = {
	body: string;
	parentPostId: string | null;
};

const REPLY_DRAFT_PREFIX = 'storied:reply-draft:v1';

function replyDraftKey(userId: string, composerId: string) {
	return `${REPLY_DRAFT_PREFIX}:${userId}:${composerId}`;
}

export function loadReplyDraft(userId: string, composerId: string): ReplyDraft | null {
	try {
		const stored = localStorage.getItem(replyDraftKey(userId, composerId));
		if (!stored) return null;

		const draft: unknown = JSON.parse(stored);
		if (
			typeof draft !== 'object' ||
			draft === null ||
			!('body' in draft) ||
			typeof draft.body !== 'string'
		) {
			return null;
		}

		const parentPostId =
			'parentPostId' in draft && typeof draft.parentPostId === 'string' ? draft.parentPostId : null;

		return { body: draft.body, parentPostId };
	} catch {
		return null;
	}
}

export function saveReplyDraft(userId: string, composerId: string, draft: ReplyDraft) {
	try {
		const key = replyDraftKey(userId, composerId);
		if (!draft.body.trim()) {
			localStorage.removeItem(key);
			return;
		}

		localStorage.setItem(key, JSON.stringify(draft));
	} catch {
		// Draft persistence should never prevent someone from writing or posting a reply.
	}
}

export function removeReplyDraft(userId: string, composerId: string) {
	try {
		localStorage.removeItem(replyDraftKey(userId, composerId));
	} catch {
		// Ignore unavailable or full browser storage.
	}
}
