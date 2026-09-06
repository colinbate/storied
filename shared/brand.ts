export const PRODUCT_NAME = 'Storied';
export const PRODUCT_URL = 'https://storied.bate.dev';
export const ORGANIZATION_NAME = 'Bermuda Triangle Society';
export const APP_NAME = 'The Archive';
export const APP_SHORT_NAME = 'Archive';
export const APP_SUBTITLE = `${ORGANIZATION_NAME} Discussions`;
export const PRIMARY_HOST = 'archive.bermudatrianglesociety.com';
export const PRIMARY_ORIGIN = `https://${PRIMARY_HOST}`;
export const PUBLIC_ORIGIN = 'https://bermudatrianglesociety.com';
export const PUBLIC_ABOUT_URL = `${PUBLIC_ORIGIN}/about/`;
export const PUBLIC_CONDUCT_URL = `${PUBLIC_ORIGIN}/conduct/`;
export const PUBLIC_JOIN_URL = `${PUBLIC_ORIGIN}/join/`;
export const NOTIFICATION_FROM_NAME = ORGANIZATION_NAME;
export const NOTIFICATION_FROM_ADDRESS = `notify@${PRIMARY_HOST}`;
export const RESTRICTED_ACCESS_LABEL = `${APP_SHORT_NAME} Access I`;

export function pageTitle(title?: string): string {
	return title ? `${title} — ${APP_NAME}` : `${APP_NAME} — ${APP_SUBTITLE}`;
}
