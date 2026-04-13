# Push Notifications — Implementation TODO (Day 48+)

## What needs to happen after Capacitor setup:

### iOS (requires Apple Developer account):

1. Enable Push Notifications capability in Xcode
2. Generate APNs certificate in Apple Developer portal
3. Add @capacitor/push-notifications plugin
4. Request permission on first app load
5. Register device token with Supabase (new table: device_tokens)
6. Set up Supabase Edge Function to send notifications via APNs

### Android (requires Firebase):

1. Add google-services.json to android/app/
2. Enable Firebase Cloud Messaging in Firebase Console
3. Add @capacitor/push-notifications plugin
4. Request permission on first app load
5. Register FCM token with Supabase
6. Set up Supabase Edge Function to send via FCM

### Notification triggers to implement:

- Daily mission reminder: 6pm if missions incomplete
- Streak danger alert: 8pm if streak > 3 and missions incomplete
- Sunday reflection reminder: 2pm every Sunday
- Monday new week notification: 8am every Monday
- Weekly quest unlock: when new batch generates
- Milestone celebrations: level up, streak milestones

### Supabase Edge Function needed:

- Cron job running every hour
- Check all users for pending notifications
- Send via APNs/FCM based on device platform
- Respect user notification preferences

## Estimated implementation time: 2-3 days (Days 48-50)
