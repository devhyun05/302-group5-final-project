# Firebase push notification setup

The app code and backend delivery path are disabled until both Firebase and APNs
credentials are configured. Do not commit service-account JSON or APNs keys.

## iOS app

1. Register the production iOS bundle identifier in Firebase. The Xcode project
   currently uses `com.aiarmakeupguides.mobile` for Debug and `com.aura.mobile`
   for Release, so confirm the release identifier before downloading the file.
2. Download `GoogleService-Info.plist` and add it to the `AURA` target in Xcode.
   Keep the local file under `apps/mobile/ios/AURA/`; it is gitignored.
3. In Apple Developer, enable Push Notifications for the App ID and create an
   APNs authentication key (`.p8`). Upload the key, Key ID, and Team ID to
   Firebase Cloud Messaging settings.
4. Build a new native app with
   `EXPO_PUBLIC_FIREBASE_MESSAGING_ENABLED=true`. A JavaScript-only bundle update
   cannot add the Firebase native modules or push entitlement.

## Backend

1. Create a Firebase service account with only the permission required to send
   FCM messages.
2. Store the complete service-account JSON in AWS Secrets Manager.
3. Map that secret to `FIREBASE_SERVICE_ACCOUNT_JSON` in the ECS task definition.
   The ECS execution role needs `secretsmanager:GetSecretValue` for that secret.
4. Set `FIREBASE_PUSH_ENABLED=true` and `FIREBASE_PROJECT_ID=<project-id>`.
5. Deploy the new backend task definition. The runtime migration creates the
   notification preference and device-token tables.

## Verification

1. Sign in on a physical iPhone and enable `설정 > 푸시 알림`.
2. Put the app in the background.
3. From the partner web, send a message, confirm a booking, and start a call.
4. Verify that tapping the notification opens the consultation conversation or
   call screen.
