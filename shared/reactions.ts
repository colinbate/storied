export const MAX_REACTION_EMOJIS = 20;
export const REACTION_NOTIFICATION_DELAY_SECONDS = 60;
export const REACTION_NOTIFICATION_THROTTLE_MS = 10 * 60 * 1000;

export function reactionTargetKey(threadId: string, postId: string | null) {
	return postId ? `post:${postId}` : `thread:${threadId}`;
}

export type ReactionSummary = {
	emoji: string;
	name: string;
	count: number;
	reacted: boolean;
};
