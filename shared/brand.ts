export const APP_NAME = 'The Archive';
export const APP_SUBTITLE = 'Bermuda Triangle Society Discussions';
export const PRODUCT_NAME = 'Storied';
export const PRIMARY_HOST = 'archive.bermudatrianglesociety.com';
export const PRIMARY_ORIGIN = `https://${PRIMARY_HOST}`;
export const NOTIFICATION_FROM_ADDRESS = `notify@${PRIMARY_HOST}`;

export function pageTitle(title?: string): string {
	return title ? `${title} — ${APP_NAME}` : `${APP_NAME} — ${APP_SUBTITLE}`;
}
