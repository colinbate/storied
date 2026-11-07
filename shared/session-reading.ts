import type { SubjectSessionReadingChoice } from './worker-messages';

export const BOOK_READING_STATUS = {
	considering: 'want_to_read',
	planned: 'want_to_read',
	reading: 'reading',
	finished: 'read',
	did_not_finish: 'did_not_finish'
} as const satisfies Record<SubjectSessionReadingChoice['readingStatus'], string>;
