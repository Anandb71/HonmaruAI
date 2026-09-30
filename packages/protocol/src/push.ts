// Push notifications: a phone's token (worker/src/index.js /devices) and what
// a notification carries back to the app (worker/src/pushes.js).

/// Which push service a token belongs to: APNs for an iPhone, FCM for Android.
export type PushPlatform = 'ios' | 'android'

/// POST /devices. The native token itself, not an Expo push token: the Worker
/// talks to Apple and Google directly.
export interface DeviceRegistration {
  deviceToken: string
  platform: PushPlatform
  /// Which APNs gateway issued an iPhone's token (a development build's is
  /// sandbox). Ignored for Android.
  environment?: 'sandbox' | 'production'
}

/// The custom data of a message notification, on both platforms. APNs puts
/// these keys beside `aps`; FCM sends them as strings, and again as one JSON
/// string under `body`, which expo-notifications turns into the data.
export interface MessagePush {
  kind: 'message'
  orgId: string
  channel: string
  messageId: string
  parentId?: string | null
}
