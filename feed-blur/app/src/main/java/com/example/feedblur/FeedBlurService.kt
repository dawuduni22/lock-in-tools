package com.example.feedblur

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.Path
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import java.io.File
import kotlin.random.Random

class FeedBlurService : AccessibilityService() {

    companion object {
        const val TAG = "FeedBlur"
        private const val IG = "com.instagram.android"

        private const val TICK_FAST = 250L      // while Instagram is foreground
        private const val TICK_SLOW = 900L      // otherwise
        private const val EVENT_THROTTLE = 60L
        private const val NONE_STREAK_TO_HIDE = 2
        private const val STALE_MS = 2200L
        private const val UNMUTE_DELAY_MS = 350L
        private const val NAV_TICK_MS = 380L
        private const val NAV_MAX = 14

        private val TAB_BAR_IDS = listOf(
            "$IG:id/tab_bar",
            "$IG:id/tab_bar_container",
            "$IG:id/bottom_navigation_bar"
        )
        private val FEED_IDS = listOf(
            "$IG:id/feed_recycler_view",
            "$IG:id/main_feed_recycler_view",
            "$IG:id/feed_list_view"
        )
        private val TRAY_IDS = listOf(
            "$IG:id/reel_tray_container",
            "$IG:id/reel_tray_recycler_view",
            "$IG:id/tray_container",
            "$IG:id/stories_tray"
        )
        private val PROFILE_IDS = listOf(
            "$IG:id/profile_header_avatar",
            "$IG:id/row_profile_header_container",
            "$IG:id/profile_header_follow_button",
            "$IG:id/user_detail_header"
        )
        private val SEARCH_IDS = listOf(
            "$IG:id/action_bar_search_edit_text",
            "$IG:id/search_edit_text",
            "$IG:id/action_bar_search_hint_text",
            "$IG:id/search_bar"
        )
        private val DIRECT_NEEDLES = listOf(
            "direct_inbox", "inbox_recycler", "inbox_list", "thread_list",
            "direct_thread", "thread_message_list", "message_composer",
            "row_inbox", "direct_search", "direct_fragment", "inbox_container"
        )

        private val QUOTES = arrayOf(
            "The scroll has no bottom, but neither does your potential",
            "A closed app opens a life",
            "The algorithm doesn't miss you, someone in your life does",
            "Fortune favors the un-distracted",
            "You cannot pause a moment you never showed up for",
            "The next reel is never the last reel",
            "Idle thumbs, idle mind",
            "What you feed your attention, you become",
            "The best content is the life you're not filming",
            "Boredom is not an emergency",
            "Nobody on their deathbed asked for five more minutes of Reels",
            "This feed was designed to never end, you were not",
            "The urge passes in ninety seconds, the video doesn't",
            "A watched feed never boils over into meaning",
            "The thumb that scrolls forgets what it was reaching for",
            "Attention is the only currency you can't earn back",
            "The present moment buffers faster than any video",
            "Silence loads instantly",
            "Your life is not a queue",
            "You are the main character, not the audience",
            "The best filter is putting the phone down",
            "Nothing on this feed is waiting for you, but someone offline might be",
            "A mind that rests is not a mind that's wasted",
            "The algorithm has no plans for your future, but you do",
            "Every scroll not taken is a minute returned",
            "The feed refreshes, your time does not",
            "Stillness has no notifications, but it has everything you need",
            "What you don't watch, you still keep",
            "The best story today might be the one you live, not scroll",
            "Comparison is a highlight reel you didn't ask to star in",
            "The exit button is also a door",
            "Nothing scrolls backward except regret",
            "A closed screen opens an ear, an eye, a hand",
            "You were bored before the app existed, and you survived",
            "The next video promises everything and delivers nothing",
            "Discipline is a muscle the feed never trains",
            "A quiet mind cannot be swiped away",
            "The scroll ends where your attention begins again",
            "You do not owe the feed your evening",
            "What waits offline does not buffer",
            "Time spent chasing content is time not spent creating it",
            "The algorithm learns you, make sure it's learning the real one",
            "A minute reclaimed is a minute you'll never regret",
            "The feed is infinite, you are not",
            "Rest is productive even when it looks like nothing",
            "The best swipe is the one you don't make",
            "No reel has ever finished a book, called a friend, or slept eight hours",
            "Your future self is not watching this",
            "Put the phone down before the moment does",
            "The clock does not pause for content",
            "The richest life is rarely lived through a screen",
            "What you scroll past, you'll never get back, and what you look up at, you might"
        )
    }

    private enum class Mode { NONE, BLUR, SOLID }
    private data class Decision(val mode: Mode, val rect: Rect?, val label: String)

    private val handler = Handler(Looper.getMainLooper())
    private lateinit var wm: WindowManager
    private lateinit var audio: AudioManager

    private var overlay: FrameLayout? = null
    private var labelView: TextView? = null
    private var quoteView: TextView? = null
    private var rowTop: LinearLayout? = null
    private var rowBottom: LinearLayout? = null
    private var params: WindowManager.LayoutParams? = null

    private var appliedMode = Mode.NONE
    private var appliedRect: Rect? = null
    private var appliedSolid = false
    private var panelKey = ""
    private var lastQuote = -1

    private var blurOk = false
    private var igForeground = false
    private var lastEventEval = 0L
    private var lastDecisionAt = 0L
    private var noneStreak = 0
    private var scrollFixes = 0
    private var lastScrollFix = 0L

    private var navActive = false
    private var navAttempts = 0
    private var navTarget = "home"
    private var passThrough = false

    private var wantMute = false
    private var muteApplied = false
    private var focusReq: AudioFocusRequest? = null

    private val unmuteRunnable = Runnable { doUnmute() }
    private val navRunnable = Runnable { navStep() }

    private val tick = object : Runnable {
        override fun run() {
            evaluate()
            assertMute()
            handler.postDelayed(this, if (igForeground) TICK_FAST else TICK_SLOW)
        }
    }

    private fun rearmTick(delay: Long) {
        handler.removeCallbacks(tick)
        handler.postDelayed(tick, delay)
    }

    private val screenReceiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context?, i: Intent?) {
            when (i?.action) {
                Intent.ACTION_SCREEN_OFF -> hideAll("screen off")
                Intent.ACTION_SCREEN_ON, Intent.ACTION_USER_PRESENT -> {
                    // process may have been frozen, restart the loop and burst
                    rearmTick(0)
                    for (d in longArrayOf(300, 700, 1400)) handler.postDelayed({ evaluate() }, d)
                }
            }
        }
    }

    // ---------------- lifecycle ----------------

    override fun onServiceConnected() {
        super.onServiceConnected()
        wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        audio = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        blurOk = wm.isCrossWindowBlurEnabled
        wm.addCrossWindowBlurEnabledListener { on -> blurOk = on }

        val f = IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_OFF)
            addAction(Intent.ACTION_SCREEN_ON)
            addAction(Intent.ACTION_USER_PRESENT)
        }
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(screenReceiver, f, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(screenReceiver, f)
        }

        restoreStaleVolume()
        Prefs.setStr(this, Prefs.STATE, "waiting")
        rearmTick(0)
        Log.i(TAG, "connected, blur=" + blurOk)
    }

    override fun onInterrupt() {}
    override fun onUnbind(intent: Intent?): Boolean { teardown(); return super.onUnbind(intent) }
    override fun onDestroy() { teardown(); super.onDestroy() }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        removeOverlay()
        rearmTick(350)
    }

    private fun teardown() {
        handler.removeCallbacksAndMessages(null)
        navActive = false
        wantMute = false
        doUnmute()
        removeOverlay()
        try { unregisterReceiver(screenReceiver) } catch (e: Exception) {}
        Prefs.setStr(this, Prefs.STATE, "service off")
    }

    // ---------------- events ----------------

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // self-heal: every event re-arms the loop even if all timers were purged by a freeze
        rearmTick(TICK_FAST)

        val now = SystemClock.uptimeMillis()
        if (now - lastEventEval >= EVENT_THROTTLE) {
            lastEventEval = now
            evaluate()
        }
        if (event?.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            handler.postDelayed({ evaluate() }, 120)
            handler.postDelayed({ evaluate() }, 350)
            if (Prefs.bool(this, Prefs.DEBUG, false)) handler.postDelayed({ dumpTree() }, 600)
        }
    }

    // ---------------- window access ----------------

    private fun imePackages(): Set<String> {
        val out = HashSet<String>()
        try {
            for (w in windows) {
                if (w.type == AccessibilityWindowInfo.TYPE_INPUT_METHOD) {
                    val p = try { w.root?.packageName?.toString() } catch (e: Exception) { null }
                    if (p != null) out.add(p)
                }
            }
        } catch (e: Exception) {}
        return out
    }

    private fun activePackage(): String? = try {
        rootInActiveWindow?.packageName?.toString()
    } catch (e: Exception) { null }

    private fun igRoot(): AccessibilityNodeInfo? {
        val active = try { rootInActiveWindow } catch (e: Exception) { null }
        if (active != null && active.packageName?.toString() == IG) {
            try { active.refresh() } catch (e: Exception) {}
            return active
        }
        try {
            var best: AccessibilityNodeInfo? = null
            var bestArea = 0
            for (w in windows) {
                if (w.type != AccessibilityWindowInfo.TYPE_APPLICATION) continue
                val r = try { w.root } catch (e: Exception) { null } ?: continue
                if (r.packageName?.toString() != IG) continue
                if (w.isActive || w.isFocused) {
                    try { r.refresh() } catch (e: Exception) {}
                    return r
                }
                val b = Rect(); w.getBoundsInScreen(b)
                val a = b.width() * b.height()
                if (a > bestArea) { bestArea = a; best = r }
            }
            if (best != null) { try { best.refresh() } catch (e: Exception) {}; return best }
        } catch (e: Exception) {}
        return null
    }

    // ---------------- main loop ----------------

    private fun evaluate() {
        val active = activePackage()
        val neutral = active == null || active == packageName ||
            active == "com.android.systemui" || imePackages().contains(active) ||
            (active != null && (active.contains("inputmethod") || active.contains("honeyboard") ||
                active.contains("keyboard")))

        if (active != IG && !neutral) {
            // some other real app is on top: clear immediately
            hideAll("not in Instagram")
            return
        }

        val root = igRoot()
        if (root == null) {
            if (!neutral) hideAll("not in Instagram")
            return
        }

        igForeground = true
        val d = classify(root)
        lastDecisionAt = SystemClock.uptimeMillis()
        if (Prefs.str(this, Prefs.STATE, "") != d.label) Prefs.setStr(this, Prefs.STATE, d.label)

        if (d.mode == Mode.NONE) {
            noneStreak++
            if (noneStreak >= NONE_STREAK_TO_HIDE) hidePanel()
        } else {
            noneStreak = 0
            showOverlay(d)
        }

        // stale safety
        if (appliedMode != Mode.NONE &&
            SystemClock.uptimeMillis() - lastDecisionAt > STALE_MS) {
            hidePanel()
        }
    }

    private fun hideAll(state: String) {
        igForeground = false
        noneStreak = 0
        scrollFixes = 0
        cancelNav()
        setMuteWanted(false)
        hidePanel()
        if (Prefs.str(this, Prefs.STATE, "") != state) Prefs.setStr(this, Prefs.STATE, state)
    }

    // ---------------- calibration ----------------

    private fun px(dp: Int) = (dp * resources.displayMetrics.density).toInt()
    private fun bottomLift() = px(Prefs.int(this, Prefs.BOTTOM_LIFT, 24))
    private fun topNudge() = px(Prefs.int(this, Prefs.TOP_NUDGE, 0))

    // ---------------- classification ----------------

    private fun visRect(n: AccessibilityNodeInfo): Rect? {
        if (!n.isVisibleToUser) return null
        val r = Rect(); n.getBoundsInScreen(r)
        if (r.width() <= 0 || r.height() <= 0) return null
        return r
    }

    private fun classify(root: AccessibilityNodeInfo): Decision {
        val b = wm.currentWindowMetrics.bounds
        val w = b.width()
        val h = b.height()

        val tabBar = findTabBar(root, w, h)
        val tab = if (tabBar != null) selectedTab(tabBar) else null
        val tabTop = tabBarTop(tabBar, h) - bottomLift()

        // 1. fullscreen reels viewer, any surface (substring match, visible only)
        if (Prefs.bool(this, Prefs.BLOCK_REELS, true) && hasVisibleClips(root, h)) {
            return Decision(Mode.SOLID, Rect(0, 0, w, h), "Reels blocked")
        }

        // 2. reels tab
        if (Prefs.bool(this, Prefs.BLOCK_REELS, true) && tab == "reels") {
            return Decision(Mode.SOLID, Rect(0, contentTop(root, h), w, tabTop), "Reels blocked")
        }

        // 3. user is typing somewhere: always allowed (search, comments, bio, etc.)
        if (hasFocusedInput(root)) return Decision(Mode.NONE, null, "typing")

        // 4. DMs
        if (looksLikeDirect(root, h)) return Decision(Mode.NONE, null, "allowed")

        val searchBottom = searchInputBottom(root, h)

        // 5. Explore grid, leaving search usable
        if (Prefs.bool(this, Prefs.BLOCK_EXPLORE, false) && tab == "explore") {
            val top = (if (searchBottom > 0) searchBottom else (h * 0.14f).toInt()) + topNudge()
            if (tabTop - top > h * 0.10f) {
                return Decision(Mode.SOLID, Rect(0, top, w, tabTop), "Explore blocked")
            }
        }

        // 6. reels tab inside a profile
        if (Prefs.bool(this, Prefs.BLOCK_PROFILE_REELS, true) && tab != "explore" && searchBottom < 0) {
            val strip = profileReelsTab(root, h)
            if (strip != null) {
                val tr = visRect(strip)
                if (tr != null) {
                    val top = tr.bottom + topNudge()
                    if (tabTop - top > h * 0.10f) {
                        return Decision(Mode.SOLID, Rect(0, top, w, tabTop), "Profile reels blocked")
                    }
                }
            }
            // 7. profile media scroll-through
            val media = mediaFeedRect(root, tabBar, tabTop, w, h)
            if (media != null) return Decision(Mode.SOLID, media, "Profile media blocked")
        }

        // 8. home feed
        if (Prefs.bool(this, Prefs.BLOCK_FEED, true) && tabBar != null) {
            val onProfile = tab == "profile" || firstVisible(root, PROFILE_IDS) != null
            if (!onProfile) {
                val tray = firstVisible(root, TRAY_IDS) ?: findTrayStructural(root, h)
                val feedId = firstVisible(root, FEED_IDS)
                val otherTab = tab == "explore" || tab == "activity" || tab == "create"
                val onHome = if (tab == "home") true
                else if (tab == null && !otherTab) {
                    (tray != null || feedId != null) && !hasBackAffordance(root, w, h)
                } else false

                if (onHome) {
                    val r = feedRect(root, tray, feedId, tabTop, w, h)
                    if (r != null) return Decision(Mode.BLUR, r, "Feed hidden")
                }
            }
        }

        return Decision(Mode.NONE, null, "allowed")
    }

    private fun hasVisibleClips(root: AccessibilityNodeInfo, h: Int): Boolean {
        var hit = false
        walk(root, 500) { n ->
            if (hit) return@walk
            val id = n.viewIdResourceName ?: return@walk
            val short = id.substringAfterLast("/")
            if (!short.contains("clips")) return@walk
            val r = visRect(n) ?: return@walk
            if (r.height() > h * 0.6f) hit = true
        }
        return hit
    }

    private fun hasFocusedInput(root: AccessibilityNodeInfo): Boolean {
        var hit = false
        walk(root, 400) { n ->
            if (hit) return@walk
            val cn = n.className?.toString() ?: return@walk
            if (!cn.contains("EditText") && !cn.contains("AutoComplete")) return@walk
            if (n.isVisibleToUser && n.isFocused) hit = true
        }
        return hit
    }

    private fun searchInputBottom(root: AccessibilityNodeInfo, h: Int): Int {
        for (id in SEARCH_IDS) {
            val list = try { root.findAccessibilityNodeInfosByViewId(id) } catch (e: Exception) { null }
                ?: continue
            for (n in list) {
                val r = visRect(n) ?: continue
                if (r.bottom in 1 until (h * 0.30f).toInt()) return r.bottom
            }
        }
        var best = -1
        walk(root, 350) { n ->
            if (best > 0) return@walk
            val cn = n.className?.toString() ?: return@walk
            if (!cn.contains("EditText") && !cn.contains("SearchView")) return@walk
            val r = visRect(n) ?: return@walk
            if (r.bottom in 1 until (h * 0.30f).toInt()) best = r.bottom
        }
        return best
    }

    private fun contentTop(root: AccessibilityNodeInfo, h: Int): Int {
        var top = 0
        walk(root, 200) { n ->
            val id = n.viewIdResourceName ?: return@walk
            if (id.contains("action_bar") || id.contains("title_bar")) {
                val r = visRect(n) ?: return@walk
                if (r.bottom in 1 until (h * 0.20f).toInt() && r.bottom > top) top = r.bottom
            }
        }
        return top
    }

    private fun profileReelsTab(root: AccessibilityNodeInfo, h: Int): AccessibilityNodeInfo? {
        var hit: AccessibilityNodeInfo? = null
        walk(root, 450) { n ->
            if (hit != null) return@walk
            val d = n.contentDescription?.toString()?.lowercase() ?: return@walk
            if (!d.contains("reel") && !d.contains("clips")) return@walk
            val r = visRect(n) ?: return@walk
            if (r.top > h * 0.80f || r.top < h * 0.10f) return@walk
            val marked = n.isSelected || n.isChecked || d.contains("selected") ||
                (try { n.parent?.isSelected } catch (e: Exception) { null }) == true
            if (marked) hit = n
        }
        return hit
    }

    private fun mediaFeedRect(
        root: AccessibilityNodeInfo,
        tabBar: AccessibilityNodeInfo?,
        tabTop: Int,
        w: Int,
        h: Int
    ): Rect? {
        if (!hasBackAffordance(root, w, h)) return null
        val sc = findLargestScrollable(root) ?: return null
        val sr = visRect(sc) ?: return null
        if (sr.height() < h * 0.45f) return null

        var share = false
        var like = 0
        walk(root, 500) { n ->
            if (!n.isVisibleToUser) return@walk
            val d = (n.contentDescription?.toString() ?: "").lowercase()
            if (d.contains("share")) share = true
            if (d.startsWith("like")) like++
        }
        if (!share || like < 1) return null

        val top = (if (sr.top > 0) sr.top else (h * 0.10f).toInt()) + topNudge()
        val bottom = if (tabBar != null) tabTop else minOf(sr.bottom, h)
        if (bottom - top < h * 0.20f) return null
        return Rect(0, top, w, bottom)
    }

    private fun looksLikeDirect(root: AccessibilityNodeInfo, h: Int): Boolean {
        var hit = false
        walk(root, 500) { n ->
            if (hit) return@walk
            val id = n.viewIdResourceName ?: return@walk
            val short = id.substringAfterLast("/")
            for (needle in DIRECT_NEEDLES) {
                if (short.contains(needle)) {
                    val r = visRect(n) ?: return@walk
                    if (r.height() > h * 0.20f) { hit = true; return@walk }
                }
            }
        }
        return hit
    }

    private fun hasBackAffordance(root: AccessibilityNodeInfo, w: Int, h: Int): Boolean {
        var hit = false
        walk(root, 300) { n ->
            if (hit) return@walk
            if (!n.isVisibleToUser) return@walk
            val s = (n.contentDescription?.toString() ?: "").lowercase().trim()
            if (s == "back" || s.startsWith("back ") || s.contains("navigate up")) {
                val r = Rect(); n.getBoundsInScreen(r)
                if (r.top < h * 0.16f && r.left < w * 0.25f) hit = true
            }
        }
        return hit
    }

    private fun tabBarTop(tabBar: AccessibilityNodeInfo?, h: Int): Int {
        if (tabBar == null) return (h * 0.90f).toInt()
        val r = Rect(); tabBar.getBoundsInScreen(r)
        return if (r.top > h * 0.5) r.top else (h * 0.90f).toInt()
    }

    private fun feedRect(
        root: AccessibilityNodeInfo,
        tray: AccessibilityNodeInfo?,
        feedId: AccessibilityNodeInfo?,
        tabTop: Int,
        w: Int,
        h: Int
    ): Rect? {
        val fallbackTop = (h * Prefs.int(this, Prefs.TOP_PCT, 24) / 100f).toInt()
        val container = feedId ?: findLargestScrollable(root)

        var top: Int
        var bottom: Int
        val cr = if (container != null) visRect(container) else null
        if (cr != null) {
            top = if (cr.top > 0) cr.top else fallbackTop
            bottom = if (cr.bottom in 1..tabTop) cr.bottom else tabTop
        } else {
            top = fallbackTop
            bottom = tabTop
        }

        val tr = if (tray != null) visRect(tray) else null
        if (tr != null && tr.bottom > 0 && tr.bottom < h * 0.5f) {
            top = tr.bottom
            scrollFixes = 0
        } else {
            maybeScrollToTop(container)
        }

        top += topNudge()
        if (bottom > tabTop) bottom = tabTop
        if (bottom - top < h * 0.15f) { top = fallbackTop + topNudge(); bottom = tabTop }
        if (bottom - top < h * 0.10f) return null
        return Rect(0, top, w, bottom)
    }

    private fun tabKey(desc: String?): String? {
        val d = desc?.lowercase() ?: return null
        return when {
            d.startsWith("home") -> "home"
            d.contains("reel") -> "reels"
            d.contains("search") || d.contains("explore") -> "explore"
            d.contains("profile") -> "profile"
            d.contains("notification") || d.contains("activity") -> "activity"
            d.contains("create") || d.contains("new post") -> "create"
            else -> null
        }
    }

    private fun findTabBar(root: AccessibilityNodeInfo, w: Int, h: Int): AccessibilityNodeInfo? {
        for (id in TAB_BAR_IDS) {
            val f = try { root.findAccessibilityNodeInfosByViewId(id) } catch (e: Exception) { null }
            if (f != null) for (n in f) if (n.isVisibleToUser) return n
        }
        var found: AccessibilityNodeInfo? = null
        walk(root, 450) { n ->
            if (found != null) return@walk
            if (!n.isVisibleToUser) return@walk
            if (n.childCount in 3..7) {
                val r = Rect(); n.getBoundsInScreen(r)
                if (r.top > h * 0.80 && r.height() < h * 0.18 && r.width() > w * 0.7) {
                    var keys = 0
                    for (i in 0 until n.childCount) {
                        val c = try { n.getChild(i) } catch (e: Exception) { null } ?: continue
                        if (tabKey(c.contentDescription?.toString()) != null) keys++
                    }
                    if (keys >= 3) found = n
                }
            }
        }
        return found
    }

    private fun selectedTab(tabBar: AccessibilityNodeInfo): String? {
        var sel: String? = null
        walk(tabBar, 90) { n ->
            if (sel != null) return@walk
            val desc = n.contentDescription?.toString() ?: return@walk
            val key = tabKey(desc) ?: return@walk
            val marked = n.isSelected ||
                desc.lowercase().contains("selected") ||
                (try { n.parent?.isSelected } catch (e: Exception) { null }) == true
            if (marked) sel = key
        }
        return sel
    }

    private fun findTrayStructural(root: AccessibilityNodeInfo, h: Int): AccessibilityNodeInfo? {
        var best: AccessibilityNodeInfo? = null
        walk(root, 350) { n ->
            if (best != null || !n.isScrollable) return@walk
            val r = visRect(n) ?: return@walk
            if (r.top < h * 0.35 && r.height() > h * 0.06 && r.height() < h * 0.25) best = n
        }
        return best
    }

    private fun findLargestScrollable(root: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        var best: AccessibilityNodeInfo? = null
        var area = 0
        walk(root, 450) { n ->
            if (!n.isScrollable) return@walk
            val r = visRect(n) ?: return@walk
            val a = r.width() * r.height()
            if (a > area) { area = a; best = n }
        }
        return best
    }

    private fun firstVisible(root: AccessibilityNodeInfo, ids: List<String>): AccessibilityNodeInfo? {
        for (id in ids) {
            val f = try { root.findAccessibilityNodeInfosByViewId(id) } catch (e: Exception) { null }
            if (f != null) for (n in f) if (n.isVisibleToUser) return n
        }
        return null
    }

    private fun maybeScrollToTop(container: AccessibilityNodeInfo?) {
        if (container == null || scrollFixes >= 8) return
        val now = SystemClock.uptimeMillis()
        if (now - lastScrollFix < 350) return
        lastScrollFix = now
        scrollFixes++
        try { container.performAction(AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD) } catch (e: Exception) {}
    }

    // ---------------- navigation ----------------

    private fun tapAt(x: Int, y: Int) {
        try {
            val p = Path()
            p.moveTo(x.toFloat(), y.toFloat())
            dispatchGesture(
                GestureDescription.Builder()
                    .addStroke(GestureDescription.StrokeDescription(p, 0, 60)).build(),
                null, null
            )
        } catch (e: Exception) { Log.w(TAG, "tap failed", e) }
    }

    private fun clickNode(n: AccessibilityNodeInfo): Boolean {
        var t: AccessibilityNodeInfo? = n
        var depth = 0
        while (t != null && depth < 5) {
            if (t.isClickable) {
                val ok = try { t.performAction(AccessibilityNodeInfo.ACTION_CLICK) } catch (e: Exception) { false }
                if (ok) return true
            }
            t = try { t.parent } catch (e: Exception) { null }
            depth++
        }
        val r = Rect(); n.getBoundsInScreen(r)
        if (r.width() > 0 && r.height() > 0) { tapAt(r.centerX(), r.centerY()); return true }
        return false
    }

    private fun findTabNode(tabBar: AccessibilityNodeInfo, key: String): AccessibilityNodeInfo? {
        var hit: AccessibilityNodeInfo? = null
        walk(tabBar, 90) { n ->
            if (hit != null) return@walk
            if (tabKey(n.contentDescription?.toString()) == key) hit = n
        }
        return hit
    }

    private fun setPassThrough(on: Boolean) {
        passThrough = on
        val p = params ?: return
        val v = overlay ?: return
        p.flags = if (on) p.flags or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
                  else p.flags and WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE.inv()
        try { wm.updateViewLayout(v, p) } catch (e: Exception) {}
    }

    private fun startNav(target: String) {
        cancelNav()
        navTarget = target
        navAttempts = 0
        navActive = true
        setPassThrough(true)
        handler.post(navRunnable)
    }

    private fun cancelNav() {
        handler.removeCallbacks(navRunnable)
        if (navActive) {
            navActive = false
            setPassThrough(false)
        }
    }

    private fun finishNav(success: Boolean) {
        navActive = false
        setPassThrough(false)
        handler.removeCallbacks(navRunnable)
        appliedRect = null   // force a repaint on the next decision
        if (!success) {
            setMuteWanted(false)
            performGlobalAction(GLOBAL_ACTION_HOME)
            handler.postDelayed({ hideAll("not in Instagram") }, 250)
            return
        }
        evaluate()
        handler.postDelayed({ evaluate() }, 150)
        handler.postDelayed({ evaluate() }, 400)
    }

    private fun navStep() {
        if (!navActive) return
        navAttempts++
        if (navAttempts > NAV_MAX) { finishNav(false); return }

        val root = igRoot()
        if (root == null) { handler.postDelayed(navRunnable, NAV_TICK_MS); return }

        val b = wm.currentWindowMetrics.bounds
        val tabBar = findTabBar(root, b.width(), b.height())

        if (tabBar != null) {
            if (selectedTab(tabBar) == navTarget) { finishNav(true); return }
            val node = findTabNode(tabBar, navTarget)
            if (node != null) {
                clickNode(node)
            } else {
                val r = Rect(); tabBar.getBoundsInScreen(r)
                val slots = 5
                val idx = if (navTarget == "profile") slots - 1 else 0
                tapAt(r.left + r.width() * (2 * idx + 1) / (2 * slots), r.centerY())
            }
            handler.postDelayed(navRunnable, NAV_TICK_MS)
            return
        }

        performGlobalAction(GLOBAL_ACTION_BACK)
        handler.postDelayed(navRunnable, NAV_TICK_MS)
    }

    private fun closeApp() {
        cancelNav()
        setMuteWanted(false)
        performGlobalAction(GLOBAL_ACTION_HOME)
        handler.postDelayed({ hideAll("not in Instagram") }, 250)
    }

    // ---------------- overlay ----------------

    private fun nextQuote(): String {
        var i = Random.nextInt(QUOTES.size)
        if (QUOTES.size > 1 && i == lastQuote) i = (i + 1) % QUOTES.size
        lastQuote = i
        return QUOTES[i]
    }

    private fun pill(text: String, onClick: () -> Unit): TextView {
        val d = resources.displayMetrics.density
        val t = TextView(this)
        t.text = text
        t.setTextColor(Color.WHITE)
        t.textSize = 15f
        t.typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
        t.gravity = Gravity.CENTER
        t.setPadding((26 * d).toInt(), (12 * d).toInt(), (26 * d).toInt(), (12 * d).toInt())
        val g = GradientDrawable()
        g.cornerRadius = 100 * d
        g.setColor(Color.argb(48, 255, 255, 255))
        g.setStroke((1 * d).toInt(), Color.argb(72, 255, 255, 255))
        t.background = g
        t.isClickable = true
        t.setOnClickListener { onClick() }
        return t
    }

    private fun ensureOverlay() {
        if (overlay != null) return
        val d = resources.displayMetrics.density
        val sw = wm.currentWindowMetrics.bounds.width()

        val root = FrameLayout(this)
        root.setOnTouchListener { _, _ -> true }

        val col = LinearLayout(this)
        col.orientation = LinearLayout.VERTICAL
        col.gravity = Gravity.CENTER_HORIZONTAL
        col.setPadding((24 * d).toInt(), 0, (24 * d).toInt(), 0)

        val lbl = TextView(this)
        lbl.setTextColor(Color.argb(112, 255, 255, 255))
        lbl.textSize = 11.5f
        lbl.typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
        lbl.letterSpacing = 0.16f
        lbl.gravity = Gravity.CENTER
        col.addView(lbl)

        val quote = TextView(this)
        quote.setTextColor(Color.argb(238, 255, 255, 255))
        quote.textSize = 17.5f
        quote.typeface = Typeface.create("sans-serif", Typeface.NORMAL)
        quote.gravity = Gravity.CENTER
        quote.setLineSpacing(6 * d, 1f)
        quote.maxWidth = (sw * 0.80f).toInt()
        quote.setShadowLayer(10f, 0f, 1f, Color.argb(150, 0, 0, 0))
        val qLp = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        qLp.topMargin = (14 * d).toInt()
        col.addView(quote, qLp)

        val r1 = LinearLayout(this)
        r1.orientation = LinearLayout.HORIZONTAL
        r1.gravity = Gravity.CENTER
        val r1Lp = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        r1Lp.topMargin = (26 * d).toInt()
        col.addView(r1, r1Lp)
        val gap = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        gap.leftMargin = (10 * d).toInt()
        r1.addView(pill("Home") { startNav("home") })
        r1.addView(pill("Profile") { startNav("profile") }, gap)

        val r2 = LinearLayout(this)
        r2.orientation = LinearLayout.HORIZONTAL
        r2.gravity = Gravity.CENTER
        val r2Lp = LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        r2Lp.topMargin = (10 * d).toInt()
        col.addView(r2, r2Lp)
        r2.addView(pill("Close app") { closeApp() })

        root.addView(
            col,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.CENTER
            )
        )

        val p = WindowManager.LayoutParams(
            1, 1, 0, 0,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
                WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
            PixelFormat.TRANSLUCENT
        )
        p.gravity = Gravity.TOP or Gravity.START
        p.alpha = 0f

        try {
            wm.addView(root, p)
            overlay = root
            labelView = lbl
            quoteView = quote
            rowTop = r1
            rowBottom = r2
            params = p
        } catch (e: Exception) {
            Log.e(TAG, "addView failed, Appear on top granted?", e)
        }
    }

    private fun showOverlay(d: Decision) {
        ensureOverlay()
        val p = params ?: return
        val v = overlay ?: return

        val b = wm.currentWindowMetrics.bounds
        val rect = d.rect ?: Rect(0, 0, b.width(), b.height())
        val solid = d.mode == Mode.SOLID

        setMuteWanted(Prefs.bool(this, Prefs.MUTE, true))

        val key = d.mode.name + "|" + d.label
        if (key != panelKey) {
            panelKey = key
            labelView?.text = d.label.uppercase()
            quoteView?.text = nextQuote()
        }
        rowTop?.visibility = if (solid) View.VISIBLE else View.GONE
        rowBottom?.visibility = if (solid) View.VISIBLE else View.GONE

        val prev = appliedRect
        val geometrySame = appliedMode == d.mode && appliedSolid == solid && prev != null &&
            Math.abs(prev.top - rect.top) < 5 && Math.abs(prev.bottom - rect.bottom) < 5 &&
            Math.abs(prev.left - rect.left) < 5 && Math.abs(prev.right - rect.right) < 5
        if (geometrySame) return

        val radius = if (solid) 0 else Prefs.int(this, Prefs.BLUR, 60)

        p.x = rect.left
        p.y = rect.top
        p.width = rect.width()
        p.height = rect.height()
        p.alpha = 1f
        p.flags = if (passThrough) p.flags or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
                  else p.flags and WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE.inv()

        if (blurOk && radius > 0) {
            p.flags = p.flags or WindowManager.LayoutParams.FLAG_BLUR_BEHIND
            p.blurBehindRadius = radius
        } else {
            p.flags = p.flags and WindowManager.LayoutParams.FLAG_BLUR_BEHIND.inv()
            p.blurBehindRadius = 0
        }

        v.setBackgroundColor(
            when {
                solid -> Color.argb(252, 11, 11, 13)
                blurOk && radius > 0 -> Color.argb(112, 8, 8, 10)
                else -> Color.argb(249, 11, 11, 13)
            }
        )

        try {
            wm.updateViewLayout(v, p)
            appliedMode = d.mode
            appliedRect = Rect(rect)
            appliedSolid = solid
        } catch (e: Exception) {
            Log.w(TAG, "updateViewLayout failed", e)
            removeOverlay()
        }
    }

    private fun hidePanel() {
        setMuteWanted(false)
        val p = params
        val v = overlay
        if (p != null && v != null && appliedMode != Mode.NONE) {
            p.alpha = 0f
            p.x = 0; p.y = 0; p.width = 1; p.height = 1
            p.flags = p.flags or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
            p.flags = p.flags and WindowManager.LayoutParams.FLAG_BLUR_BEHIND.inv()
            p.blurBehindRadius = 0
            rowTop?.visibility = View.GONE
            rowBottom?.visibility = View.GONE
            try { wm.updateViewLayout(v, p) } catch (e: Exception) {}
        }
        appliedMode = Mode.NONE
        appliedRect = null
        panelKey = ""
    }

    private fun removeOverlay() {
        overlay?.let { try { wm.removeView(it) } catch (e: Exception) {} }
        overlay = null; labelView = null; quoteView = null
        rowTop = null; rowBottom = null; params = null
        appliedMode = Mode.NONE; appliedRect = null; panelKey = ""
        passThrough = false
    }

    // ---------------- audio ----------------

    private fun setMuteWanted(want: Boolean) {
        if (want == wantMute) { if (want) applyMute(); return }
        wantMute = want
        if (want) {
            handler.removeCallbacks(unmuteRunnable)
            applyMute()
        } else {
            handler.removeCallbacks(unmuteRunnable)
            handler.postDelayed(unmuteRunnable, UNMUTE_DELAY_MS)
        }
    }

    private fun assertMute() {
        if (!wantMute) return
        try {
            if (audio.getStreamVolume(AudioManager.STREAM_MUSIC) != 0) applyMute(force = true)
        } catch (e: Exception) {}
    }

    private fun applyMute(force: Boolean = false) {
        if (Prefs.bool(this, Prefs.PAUSE_MEDIA, false)) grabFocus()
        if (muteApplied && !force) return
        try {
            if (audio.isVolumeFixed) {
                Prefs.setStr(this, Prefs.MUTE_ERR, "device volume is fixed")
                return
            }
            val cur = audio.getStreamVolume(AudioManager.STREAM_MUSIC)
            if (!muteApplied && cur > 0) Prefs.setInt(this, Prefs.SAVED_VOL, cur)
            audio.setStreamVolume(AudioManager.STREAM_MUSIC, 0, 0)
            muteApplied = true
            Prefs.setStr(this, Prefs.MUTE_ERR, "")
        } catch (e: SecurityException) {
            try {
                audio.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_MUTE, 0)
                muteApplied = true
                Prefs.setStr(this, Prefs.MUTE_ERR, "")
            } catch (e2: Exception) {
                Prefs.setStr(this, Prefs.MUTE_ERR, "blocked by Do Not Disturb")
            }
        } catch (e: Exception) {
            Prefs.setStr(this, Prefs.MUTE_ERR, e.javaClass.simpleName)
        }
    }

    private fun doUnmute() {
        releaseFocus()
        if (!muteApplied) return
        try { audio.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_UNMUTE, 0) }
        catch (e: Exception) {}
        val v = Prefs.int(this, Prefs.SAVED_VOL, -1)
        if (v > 0) {
            try { audio.setStreamVolume(AudioManager.STREAM_MUSIC, v, 0) } catch (e: Exception) {}
        }
        Prefs.setInt(this, Prefs.SAVED_VOL, -1)
        muteApplied = false
    }

    private fun restoreStaleVolume() {
        val v = Prefs.int(this, Prefs.SAVED_VOL, -1)
        try {
            if (v > 0 && audio.getStreamVolume(AudioManager.STREAM_MUSIC) == 0) {
                audio.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_UNMUTE, 0)
                audio.setStreamVolume(AudioManager.STREAM_MUSIC, v, 0)
            }
        } catch (e: Exception) {}
        Prefs.setInt(this, Prefs.SAVED_VOL, -1)
        muteApplied = false
        wantMute = false
    }

    private fun grabFocus() {
        if (focusReq != null) return
        try {
            val attrs = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build()
            val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE)
                .setAudioAttributes(attrs)
                .setWillPauseWhenDucked(true)
                .setOnAudioFocusChangeListener { }
                .build()
            audio.requestAudioFocus(req)
            focusReq = req
        } catch (e: Exception) {}
    }

    private fun releaseFocus() {
        focusReq?.let { try { audio.abandonAudioFocusRequest(it) } catch (e: Exception) {} }
        focusReq = null
    }

    // ---------------- helpers ----------------

    private fun walk(root: AccessibilityNodeInfo, limit: Int, action: (AccessibilityNodeInfo) -> Unit) {
        val q = ArrayDeque<AccessibilityNodeInfo>()
        q.add(root)
        var c = 0
        while (q.isNotEmpty() && c < limit) {
            val n = q.removeFirst()
            c++
            try { action(n) } catch (e: Exception) {}
            for (i in 0 until n.childCount) {
                val ch = try { n.getChild(i) } catch (e: Exception) { null }
                if (ch != null) q.add(ch)
            }
        }
    }

    private fun dumpTree() {
        val root = igRoot() ?: return
        val sb = StringBuilder()
        sb.append("state=").append(Prefs.str(this, Prefs.STATE, "")).append("\n\n")
        walk(root, 600) { n ->
            val id = n.viewIdResourceName
            val desc = n.contentDescription
            val text = n.text
            if (id != null || desc != null || text != null) {
                val r = Rect(); n.getBoundsInScreen(r)
                sb.append("id=").append(id)
                    .append(" | cls=").append(n.className)
                    .append(" | desc=").append(desc)
                    .append(" | text=").append(text)
                    .append(" | sel=").append(n.isSelected)
                    .append(" | vis=").append(n.isVisibleToUser)
                    .append(" | click=").append(n.isClickable)
                    .append(" | scroll=").append(n.isScrollable)
                    .append(" | ").append(r.flattenToString())
                    .append("\n")
            }
        }
        try { File(filesDir, "dump.txt").writeText(sb.toString()) } catch (e: Exception) {}
        Log.d(TAG, "dump " + sb.length + " chars")
    }
}
