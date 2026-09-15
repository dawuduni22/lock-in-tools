# Feed Blur

An Android app that hides the Instagram feed, Reels, and Explore while leaving
messages, Stories, profiles, and search completely untouched.

Turning a block on is instant. Turning one off requires finishing a
deliberately annoying fifteen step puzzle, so switching it off is slower than
simply closing the app. That asymmetry is the point: a blocker you can defeat
in two taps does nothing.

## How it works

- An **accessibility service** reads which Instagram screen is in the
  foreground. This is the only way an app can tell your messages apart from
  your feed, and it is why the permission is required.
- An **overlay permission** lets the app draw the blur on top of Instagram.
- While a surface is covered the app takes audio focus and mutes media, then
  restores the previous volume when you leave.

Both permissions are requested on first run with an explanation of what each
one is for. The app sends nothing anywhere.

## Source

| File | Role |
|---|---|
| [`FeedBlurService.kt`](app/src/main/java/com/example/feedblur/FeedBlurService.kt) | The accessibility service. Screen detection, the blur overlays, audio focus, and the puzzle gate |
| [`MainActivity.kt`](app/src/main/java/com/example/feedblur/MainActivity.kt) | Setup screen, permission prompts, and the per-surface switches |
| [`Prefs.kt`](app/src/main/java/com/example/feedblur/Prefs.kt) | Stored settings |
| [`AndroidManifest.xml`](app/src/main/AndroidManifest.xml) | Permissions and service registration |
| [`res/xml/accessibility_service_config.xml`](app/src/main/res/xml/accessibility_service_config.xml) | Which events the service listens for |

Kotlin, minSdk 31, targetSdk 36. Version 1.0.

## Build it

Open the `feed-blur` folder in Android Studio and run, or from the command
line:

```bash
./gradlew assembleRelease
```

`local.properties` is intentionally not committed, since it contains a machine
specific SDK path. Android Studio regenerates it on first open. Building from
the command line needs either that file or an `ANDROID_HOME` environment
variable.

## Install without building

`feedblur.apk` is the signed release build, ready for an Android 12 to 16
device.

1. Copy it to the phone, or open
   [lockintools.com/feed-blur](https://lockintools.com/feed-blur) on the phone
   and download it there.
2. Open the file. Android will ask you to allow installs from that source,
   since the app did not come from the Play Store.
3. Tap Install. Play Protect may offer to scan it first, which is normal for
   any app installed outside the Play Store.
4. Open Feed Blur and follow the setup screen for the two permissions above.

Full step by step instructions written for non-technical users are at
[lockintools.com/feed-blur](https://lockintools.com/feed-blur).

## Not affiliated

Feed Blur is not connected to, endorsed by, or affiliated with Instagram or
Meta.
