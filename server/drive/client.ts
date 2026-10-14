import { google, drive_v3 } from 'googleapis';
import { createGoogleAuth } from './auth';

let driveInstance: drive_v3.Drive | null = null;

export function getDriveClient(): drive_v3.Drive {
  if (driveInstance) {
    return driveInstance;
  }

  const auth = createGoogleAuth();
  driveInstance = google.drive({ version: 'v3', auth });
  return driveInstance;
}

export function setDriveClient(mock: drive_v3.Drive | null): void {
  driveInstance = mock;
}
