import { google } from 'googleapis';
import { getConfig, ServiceAccountCredentials } from '../config';

export const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

export function createGoogleAuth(customCredentials?: ServiceAccountCredentials) {
  const config = getConfig();
  const credentials = customCredentials || config.credentials;

  if (!credentials) {
    throw new Error('Google Service Account credentials are not configured');
  }

  return new google.auth.GoogleAuth({
    credentials: {
      client_email: credentials.client_email,
      private_key: credentials.private_key,
      project_id: credentials.project_id,
    },
    scopes: DRIVE_SCOPES,
  });
}
