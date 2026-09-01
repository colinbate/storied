import { and, eq } from 'drizzle-orm';
import type { ORM } from '$lib/server/db';
import {
	attendeeIdentities,
	sessionParticipants,
	sessionParticipantSubjects,
	type SessionAttendanceStatus
} from '$lib/server/db/schema';

export function mergedAttendanceStatus(a: SessionAttendanceStatus, b: SessionAttendanceStatus) {
	const rank: Record<SessionAttendanceStatus, number> = {
		attended: 70,
		no_show: 60,
		attending: 50,
		waitlisted: 40,
		maybe: 30,
		declined: 20,
		cancelled: 10
	};
	return rank[a] >= rank[b] ? a : b;
}

/**
 * Move every session record from an unlinked guest identity to another identity.
 * When both identities already have a record for the same session, the records and
 * their reading subjects are combined before the source identity is removed.
 */
export async function mergeGuestIdentity(db: ORM, sourceId: string, targetId: string) {
	if (sourceId === targetId) throw new Error('Choose a different attendee to merge into.');

	const [source, target] = await Promise.all([
		db.select().from(attendeeIdentities).where(eq(attendeeIdentities.id, sourceId)).get(),
		db.select().from(attendeeIdentities).where(eq(attendeeIdentities.id, targetId)).get()
	]);
	if (!source) throw new Error('Previous guest not found.');
	if (source.userId) throw new Error('Member identities cannot be merged into another attendee.');
	if (!target) throw new Error('Merge destination not found.');

	const sourceParticipations = await db
		.select()
		.from(sessionParticipants)
		.where(eq(sessionParticipants.attendeeId, source.id))
		.all();

	for (const sourceParticipant of sourceParticipations) {
		const targetParticipant = await db
			.select()
			.from(sessionParticipants)
			.where(
				and(
					eq(sessionParticipants.sessionId, sourceParticipant.sessionId),
					eq(sessionParticipants.attendeeId, target.id)
				)
			)
			.get();

		if (!targetParticipant) {
			await db
				.update(sessionParticipants)
				.set({
					attendeeId: target.id,
					nameSnapshot: target.name,
					emailSnapshot: target.email,
					updatedAt: new Date().toISOString()
				})
				.where(eq(sessionParticipants.id, sourceParticipant.id));
			continue;
		}

		const sourceSubjects = await db
			.select()
			.from(sessionParticipantSubjects)
			.where(eq(sessionParticipantSubjects.participantId, sourceParticipant.id))
			.all();
		for (const subject of sourceSubjects) {
			await db
				.insert(sessionParticipantSubjects)
				.values({ ...subject, participantId: targetParticipant.id })
				.onConflictDoNothing();
		}

		const takeSourceToken =
			!targetParticipant.confirmationToken && !!sourceParticipant.confirmationToken;
		const takeSourceLegacyId =
			targetParticipant.legacyRsvpRegistrationId === null &&
			sourceParticipant.legacyRsvpRegistrationId !== null;

		// Release unique values before assigning them to the surviving record.
		if (takeSourceToken || takeSourceLegacyId) {
			await db
				.update(sessionParticipants)
				.set({
					confirmationToken: takeSourceToken ? null : sourceParticipant.confirmationToken,
					legacyRsvpRegistrationId: takeSourceLegacyId
						? null
						: sourceParticipant.legacyRsvpRegistrationId
				})
				.where(eq(sessionParticipants.id, sourceParticipant.id));
		}

		await db
			.update(sessionParticipants)
			.set({
				nameSnapshot: target.name,
				emailSnapshot: target.email,
				attendanceStatus: mergedAttendanceStatus(
					targetParticipant.attendanceStatus,
					sourceParticipant.attendanceStatus
				),
				note: targetParticipant.note ?? sourceParticipant.note,
				confirmationToken:
					targetParticipant.confirmationToken ?? sourceParticipant.confirmationToken,
				legacyRsvpRegistrationId:
					targetParticipant.legacyRsvpRegistrationId ?? sourceParticipant.legacyRsvpRegistrationId,
				updatedAt: new Date().toISOString()
			})
			.where(eq(sessionParticipants.id, targetParticipant.id));

		await db.delete(sessionParticipants).where(eq(sessionParticipants.id, sourceParticipant.id));
	}

	await db.delete(attendeeIdentities).where(eq(attendeeIdentities.id, source.id));
	return { source, target, recordsMoved: sourceParticipations.length };
}
