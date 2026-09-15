package com.example.feedblur

import android.app.Activity
import android.app.AlertDialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.AudioManager
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.SeekBar
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import java.io.File
import kotlin.random.Random

class MainActivity : Activity() {

    private val handler = Handler(Looper.getMainLooper())
    private var density = 1f
    private var night = false

    private var cBg = 0
    private var cCard = 0
    private var cText = 0
    private var cMuted = 0
    private var cDivider = 0
    private var cAccent = Color.rgb(64, 132, 250)
    private var cGood = Color.rgb(48, 186, 120)
    private var cBad = Color.rgb(226, 88, 88)

    private lateinit var vService: TextView
    private lateinit var vOverlay: TextView
    private lateinit var vNow: TextView
    private lateinit var vMuteNote: TextView

    private val REG = Typeface.create("sans-serif", Typeface.NORMAL)
    private val MED = Typeface.create("sans-serif-medium", Typeface.NORMAL)

    private val poll = object : Runnable {
        override fun run() { refresh(); handler.postDelayed(this, 700) }
    }

    override fun onCreate(s: Bundle?) {
        super.onCreate(s)
        density = resources.displayMetrics.density
        night = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
                Configuration.UI_MODE_NIGHT_YES

        cBg = if (night) Color.rgb(13, 13, 15) else Color.rgb(244, 244, 247)
        cCard = if (night) Color.rgb(26, 26, 30) else Color.WHITE
        cText = if (night) Color.rgb(236, 236, 242) else Color.rgb(22, 22, 26)
        cMuted = if (night) Color.rgb(138, 138, 150) else Color.rgb(122, 122, 134)
        cDivider = if (night) Color.rgb(42, 42, 48) else Color.rgb(232, 232, 238)

        val page = LinearLayout(this)
        page.orientation = LinearLayout.VERTICAL
        page.setBackgroundColor(cBg)
        page.setPadding(dp(16), dp(44), dp(16), dp(40))

        page.addView(text("Feed Blur", 28f, MED, cText))
        page.addView(text("Hides the Instagram feed, Reels, and Explore.", 14f, REG, cMuted)
            .also { it.setPadding(0, dp(5), 0, 0) })

        val status = card()
        vService = statusRow(status, "Accessibility service")
        vOverlay = statusRow(status, "Appear on top")
        vNow = statusRow(status, "Current screen")
        page.addView(spacer(18))
        page.addView(status)

        page.addView(section("Setup"))
        val setup = card()
        setup.addView(primary("Grant Appear on top") {
            startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + packageName)))
        })
        setup.addView(secondary("Open accessibility settings") {
            startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
        })
        page.addView(setup)

        page.addView(section("What to block"))
        val blocking = card()
        blocking.addView(switchRow("Home feed", "Stories bar and nav stay usable", Prefs.BLOCK_FEED, true, true))
        blocking.addView(divider())
        blocking.addView(switchRow("Reels", "Tab and fullscreen player", Prefs.BLOCK_REELS, true, true))
        blocking.addView(divider())
        blocking.addView(switchRow("Reels inside profiles", "Profile reels tab and post view", Prefs.BLOCK_PROFILE_REELS, true, true))
        blocking.addView(divider())
        blocking.addView(switchRow("Explore grid", "Search bar stays usable", Prefs.BLOCK_EXPLORE, false, true))
        page.addView(blocking)

        page.addView(section("Unlock puzzle"))
        val gate = card()
        gate.addView(text("Turning a block on is instant. Turning one off requires the puzzle.", 12.5f, REG, cMuted)
            .also { it.setPadding(0, dp(10), 0, dp(2)) })
        gate.addView(switchRow("Require puzzle to unblock", "Wrong tap sends you back to step one", Prefs.GATE, true, true))
        gate.addView(divider())
        gate.addView(slider("Puzzle steps", "Raising this is free, lowering it needs the puzzle", Prefs.GATE_STEPS, 10, 5, 20, "", true))
        page.addView(gate)

        page.addView(section("Calibration"))
        val cal = card()
        cal.addView(text("Panel edges are measured from Instagram itself. These nudge the result if it sits wrong.", 12.5f, REG, cMuted)
            .also { it.setPadding(0, dp(10), 0, dp(2)) })
        cal.addView(slider("Bottom edge lift", "Raises the panel off the nav bar", Prefs.BOTTOM_LIFT, 24, 0, 120, "dp", false))
        cal.addView(divider())
        cal.addView(slider("Top edge nudge", "Negative moves the top edge up", Prefs.TOP_NUDGE, 0, -60, 60, "dp", false))
        page.addView(cal)

        page.addView(section("Audio"))
        val au = card()
        au.addView(switchRow("Mute while blocked", "Affects the whole media stream", Prefs.MUTE, true, true))
        au.addView(divider())
        au.addView(switchRow("Pause other media", "Requests exclusive audio focus", Prefs.PAUSE_MEDIA, false, false))
        au.addView(divider())
        vMuteNote = text("", 12.5f, REG, cMuted)
        vMuteNote.setPadding(0, dp(10), 0, dp(2))
        au.addView(vMuteNote)
        au.addView(secondary("Test mute") { testMute() })
        au.addView(secondary("Restore media volume") { restoreVolume() })
        page.addView(au)

        page.addView(section("Appearance"))
        val look = card()
        look.addView(slider("Blur strength", "Home feed panel only. Zero shows a solid panel", Prefs.BLUR, 60, 0, 100, "", false))
        page.addView(look)

        page.addView(section("Advanced"))
        val adv = card()
        adv.addView(slider("Fallback top offset", "Percent of screen, used only if the stories bar is not found", Prefs.TOP_PCT, 24, 10, 45, "%", false))
        adv.addView(divider())
        adv.addView(switchRow("Log Instagram view tree", "For troubleshooting, leave off normally", Prefs.DEBUG, false, false))
        adv.addView(divider())
        adv.addView(secondary("View last log") { showDump() })
        adv.addView(secondary("Copy last log") { copyDump() })
        page.addView(adv)

        val sv = ScrollView(this)
        sv.setBackgroundColor(cBg)
        sv.isFillViewport = true
        sv.addView(page)
        setContentView(sv)
    }

    override fun onResume() { super.onResume(); handler.post(poll) }
    override fun onPause() { super.onPause(); handler.removeCallbacks(poll) }

    // ---------- puzzle gate ----------

    private fun makeOptions(): List<Int> {
        val nums = mutableListOf<Int>()
        while (nums.size < 4) {
            val n = Random.nextInt(1, 10)
            if (!nums.contains(n)) nums.add(n)
        }
        return nums
    }

    private fun runGate(what: String, totalSteps: Int, onPass: () -> Unit, onFail: () -> Unit = {}) {
        var index = 0
        var options = makeOptions()
        var answer = options.random()
        var prompt = "Tap the number " + answer
        var locked = true
        var render: () -> Unit = {}

        val box = LinearLayout(this)
        box.orientation = LinearLayout.VERTICAL
        box.setPadding(dp(22), dp(18), dp(22), dp(10))

        val progress = text("", 12f, MED, cMuted)
        progress.letterSpacing = 0.1f
        box.addView(progress)

        val instruction = text("", 21f, MED, cText)
        instruction.setPadding(0, dp(10), 0, dp(4))
        box.addView(instruction)

        val statusLine = text("", 13f, REG, cMuted)
        statusLine.setPadding(0, dp(2), 0, dp(12))
        box.addView(statusLine)

        val tiles = ArrayList<TextView>()
        for (r in 0 until 2) {
            val row = LinearLayout(this)
            row.orientation = LinearLayout.HORIZONTAL
            val rowLp = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
            rowLp.bottomMargin = dp(10)
            box.addView(row, rowLp)
            for (c in 0 until 2) {
                val t = text("", 26f, MED, cText)
                t.gravity = Gravity.CENTER
                t.setPadding(0, dp(20), 0, dp(20))
                val lp = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
                if (c == 0) lp.rightMargin = dp(5) else lp.leftMargin = dp(5)
                row.addView(t, lp)
                tiles.add(t)
            }
        }

        fun paintTiles(enabled: Boolean) {
            for (i in tiles.indices) {
                val g = GradientDrawable()
                g.cornerRadius = 16 * density
                g.setColor(if (enabled) (if (night) Color.rgb(40, 40, 47) else Color.rgb(240, 240, 245))
                           else (if (night) Color.rgb(26, 26, 31) else Color.rgb(248, 248, 250)))
                g.setStroke(dp(1), if (night) Color.rgb(58, 58, 66) else Color.rgb(226, 226, 233))
                tiles[i].background = g
                tiles[i].setTextColor(if (enabled) cText else cMuted)
                tiles[i].isClickable = enabled
            }
        }

        val dialog = AlertDialog.Builder(this)
            .setTitle("Unlocking " + what)
            .setView(ScrollView(this).also { it.addView(box) })
            .setCancelable(false)
            .setNegativeButton("Give up") { _, _ -> onFail() }
            .create()

        fun cooldown(ms: Long, note: String) {
            locked = true
            paintTiles(false)
            var left = ms
            val tick = object : Runnable {
                override fun run() {
                    if (!dialog.isShowing) return
                    if (left <= 0) {
                        locked = false
                        statusLine.text = ""
                        paintTiles(true)
                        return
                    }
                    statusLine.text = note + " " + ((left + 999) / 1000) + "s"
                    left -= 500
                    handler.postDelayed(this, 500)
                }
            }
            handler.post(tick)
        }

        render = {
            options = makeOptions()
            val roll = Random.nextInt(100)
            when {
                roll < 15 -> { answer = options.min(); prompt = "Tap the smallest number" }
                roll < 30 -> { answer = options.max(); prompt = "Tap the largest number" }
                else -> { answer = options.random(); prompt = "Tap the number " + answer }
            }
            progress.text = ("Step " + (index + 1) + " of " + totalSteps).uppercase()
            instruction.text = prompt
            for (i in tiles.indices) tiles[i].text = options[i].toString()
            cooldown(1500L, "Wait")
        }

        for (i in tiles.indices) {
            tiles[i].setOnClickListener {
                if (locked) return@setOnClickListener
                if (options[i] == answer) {
                    index++
                    if (index >= totalSteps) {
                        dialog.dismiss()
                        onPass()
                        toast("Unlocked.")
                    } else {
                        render()
                    }
                } else {
                    index = 0
                    statusLine.setTextColor(cBad)
                    statusLine.text = "Wrong. Starting again."
                    handler.postDelayed({
                        statusLine.setTextColor(cMuted)
                        render()
                    }, 2200)
                    locked = true
                    paintTiles(false)
                }
            }
        }

        dialog.show()
        render()
    }

    // ---------- builders ----------

    private fun dp(v: Int) = (v * density).toInt()

    private fun text(s: String, size: Float, tf: Typeface, color: Int): TextView {
        val t = TextView(this)
        t.text = s
        t.textSize = size
        t.typeface = tf
        t.setTextColor(color)
        return t
    }

    private fun spacer(h: Int): View {
        val v = View(this)
        v.layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(h))
        return v
    }

    private fun section(title: String): TextView {
        val t = text(title.uppercase(), 11.5f, MED, cMuted)
        t.letterSpacing = 0.1f
        t.setPadding(dp(6), dp(24), 0, dp(9))
        return t
    }

    private fun card(): LinearLayout {
        val l = LinearLayout(this)
        l.orientation = LinearLayout.VERTICAL
        val g = GradientDrawable()
        g.cornerRadius = 20 * density
        g.setColor(cCard)
        if (!night) g.setStroke(dp(1), Color.rgb(234, 234, 240))
        l.background = g
        l.setPadding(dp(16), dp(6), dp(16), dp(14))
        l.layoutParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        return l
    }

    private fun divider(): View {
        val v = View(this)
        v.setBackgroundColor(cDivider)
        v.layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(1))
        return v
    }

    private fun statusRow(parent: LinearLayout, name: String): TextView {
        val row = LinearLayout(this)
        row.orientation = LinearLayout.HORIZONTAL
        row.gravity = Gravity.CENTER_VERTICAL
        row.setPadding(0, dp(11), 0, dp(11))

        val left = text(name, 15.5f, REG, cText)
        left.layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        row.addView(left)

        val right = text("", 15.5f, MED, cMuted)
        right.gravity = Gravity.END
        row.addView(right)

        parent.addView(row)
        return right
    }

    private fun switchRow(title: String, sub: String, key: String,
                          def: Boolean, guarded: Boolean): LinearLayout {
        val row = LinearLayout(this)
        row.orientation = LinearLayout.HORIZONTAL
        row.gravity = Gravity.CENTER_VERTICAL
        row.setPadding(0, dp(13), 0, dp(13))

        val col = LinearLayout(this)
        col.orientation = LinearLayout.VERTICAL
        col.layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        col.addView(text(title, 15.5f, REG, cText))
        if (sub.isNotEmpty()) {
            col.addView(text(sub, 12.5f, REG, cMuted).also { it.setPadding(0, dp(2), 0, 0) })
        }
        row.addView(col)

        val sw = Switch(this)
        sw.text = ""
        sw.isChecked = Prefs.bool(this, key, def)
        sw.thumbTintList = ColorStateList(
            arrayOf(intArrayOf(android.R.attr.state_checked), intArrayOf()),
            intArrayOf(cAccent, if (night) Color.rgb(120, 120, 130) else Color.rgb(250, 250, 250))
        )
        sw.trackTintList = ColorStateList(
            arrayOf(intArrayOf(android.R.attr.state_checked), intArrayOf()),
            intArrayOf(Color.argb(120, 64, 132, 250),
                if (night) Color.rgb(60, 60, 68) else Color.rgb(200, 200, 208))
        )

        var suppress = false
        sw.setOnCheckedChangeListener { _, checked ->
            if (suppress) return@setOnCheckedChangeListener
            if (checked) { Prefs.setBool(this, key, true); return@setOnCheckedChangeListener }
            if (!guarded || !Prefs.bool(this, Prefs.GATE, true)) {
                Prefs.setBool(this, key, false)
                return@setOnCheckedChangeListener
            }
            suppress = true; sw.isChecked = true; suppress = false
            val base = Prefs.int(this, Prefs.GATE_STEPS, 10)
            val steps = if (key == Prefs.GATE) base + 5 else base
            runGate(title, steps, {
                Prefs.setBool(this, key, false)
                suppress = true; sw.isChecked = false; suppress = false
            })
        }
        row.addView(sw)
        return row
    }

    private fun slider(title: String, sub: String, key: String, def: Int,
                       min: Int, max: Int, suffix: String, guardDecrease: Boolean): LinearLayout {
        val box = LinearLayout(this)
        box.orientation = LinearLayout.VERTICAL
        box.setPadding(0, dp(13), 0, dp(6))

        val head = LinearLayout(this)
        head.orientation = LinearLayout.HORIZONTAL
        head.gravity = Gravity.CENTER_VERTICAL
        val lbl = text(title, 15.5f, REG, cText)
        lbl.layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        head.addView(lbl)
        val cur = Prefs.int(this, key, def)
        val value = text(cur.toString() + suffix, 15.5f, MED, cAccent)
        head.addView(value)
        box.addView(head)

        if (sub.isNotEmpty()) {
            box.addView(text(sub, 12.5f, REG, cMuted).also { it.setPadding(0, dp(2), 0, 0) })
        }

        val bar = SeekBar(this)
        bar.max = max - min
        bar.progress = cur - min
        bar.progressTintList = ColorStateList.valueOf(cAccent)
        bar.thumbTintList = ColorStateList.valueOf(cAccent)
        bar.setPadding(0, dp(8), 0, dp(4))
        bar.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(sb: SeekBar?, p: Int, u: Boolean) {
                value.text = (p + min).toString() + suffix
            }
            override fun onStartTrackingTouch(sb: SeekBar?) {}
            override fun onStopTrackingTouch(sb: SeekBar?) {
                val newV = (sb?.progress ?: 0) + min
                val oldV = Prefs.int(this@MainActivity, key, def)
                if (newV == oldV) return
                if (guardDecrease && newV < oldV && Prefs.bool(this@MainActivity, Prefs.GATE, true)) {
                    runGate(title, oldV, {
                        Prefs.setInt(this@MainActivity, key, newV)
                    }, {
                        bar.progress = oldV - min
                        value.text = oldV.toString() + suffix
                    })
                    return
                }
                Prefs.setInt(this@MainActivity, key, newV)
            }
        })
        box.addView(bar)
        return box
    }

    private fun buttonBase(label: String, fill: Int, textColor: Int,
                           stroke: Int, onClick: () -> Unit): TextView {
        val t = text(label, 15f, MED, textColor)
        t.gravity = Gravity.CENTER
        t.setPadding(dp(18), dp(14), dp(18), dp(14))
        val g = GradientDrawable()
        g.cornerRadius = 14 * density
        g.setColor(fill)
        if (stroke != 0) g.setStroke(dp(1), stroke)
        t.background = g
        t.isClickable = true
        t.setOnClickListener { onClick() }
        val lp = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        lp.topMargin = dp(8)
        t.layoutParams = lp
        return t
    }

    private fun primary(label: String, onClick: () -> Unit) =
        buttonBase(label, cAccent, Color.WHITE, 0, onClick)

    private fun secondary(label: String, onClick: () -> Unit) =
        buttonBase(label,
            if (night) Color.rgb(38, 38, 44) else Color.rgb(243, 243, 247),
            cText,
            if (night) Color.rgb(52, 52, 60) else Color.rgb(226, 226, 233),
            onClick)

    // ---------- logic ----------

    private fun refresh() {
        setStatus(vService, serviceEnabled())
        setStatus(vOverlay, Settings.canDrawOverlays(this))
        vNow.text = Prefs.str(this, Prefs.STATE, "unknown")
        vNow.setTextColor(cMuted)

        val err = Prefs.str(this, Prefs.MUTE_ERR, "")
        if (err.isEmpty()) {
            vMuteNote.text = "There is no per app mute without root, so background music is silenced too."
            vMuteNote.setTextColor(cMuted)
        } else {
            vMuteNote.text = "Mute problem: " + err
            vMuteNote.setTextColor(cBad)
        }
    }

    private fun setStatus(v: TextView, ok: Boolean) {
        v.text = if (ok) "On" else "Off"
        v.setTextColor(if (ok) cGood else cBad)
    }

    private fun serviceEnabled(): Boolean {
        val flat = Settings.Secure.getString(
            contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES) ?: return false
        return flat.contains(packageName + "/" + packageName + ".FeedBlurService") ||
                flat.contains(packageName + "/.FeedBlurService")
    }

    private fun testMute() {
        val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        try {
            if (am.isVolumeFixed) { toast("This device reports a fixed volume."); return }
            val v = am.getStreamVolume(AudioManager.STREAM_MUSIC)
            if (v == 0) { toast("Raise media volume first, then test again."); return }
            am.setStreamVolume(AudioManager.STREAM_MUSIC, 0, 0)
            handler.postDelayed({
                try { am.setStreamVolume(AudioManager.STREAM_MUSIC, v, 0) } catch (e: Exception) {}
            }, 1500)
            Prefs.setStr(this, Prefs.MUTE_ERR, "")
            toast("Muted 1.5s then restored. Volume control works.")
        } catch (e: SecurityException) {
            Prefs.setStr(this, Prefs.MUTE_ERR, "blocked by Do Not Disturb")
            AlertDialog.Builder(this)
                .setTitle("Volume change blocked")
                .setMessage("Do Not Disturb is preventing volume changes. Grant Feed Blur access to it, or turn Do Not Disturb off.")
                .setPositiveButton("Open settings") { _, _ ->
                    startActivity(Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS))
                }
                .setNegativeButton("Close", null)
                .show()
        } catch (e: Exception) {
            toast("Mute failed: " + e.message)
        }
    }

    private fun restoreVolume() {
        val am = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        try {
            am.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_UNMUTE, 0)
            val saved = Prefs.int(this, Prefs.SAVED_VOL, -1)
            val target = if (saved > 0) saved else am.getStreamMaxVolume(AudioManager.STREAM_MUSIC) / 2
            am.setStreamVolume(AudioManager.STREAM_MUSIC, target, 0)
            Prefs.setInt(this, Prefs.SAVED_VOL, -1)
            toast("Media volume restored.")
        } catch (e: Exception) {
            toast("Could not restore: " + e.message)
        }
    }

    private fun dumpText(): String {
        val f = File(filesDir, "dump.txt")
        return if (f.exists()) f.readText() else ""
    }

    private fun showDump() {
        val t = dumpText()
        if (t.isEmpty()) { toast("No log yet. Turn logging on, open Instagram, come back."); return }
        val tv = TextView(this)
        tv.text = if (t.length > 60000) t.substring(0, 60000) else t
        tv.textSize = 10f
        tv.typeface = Typeface.MONOSPACE
        tv.setPadding(dp(14), dp(14), dp(14), dp(14))
        tv.setTextIsSelectable(true)
        val sv = ScrollView(this); sv.addView(tv)
        AlertDialog.Builder(this).setTitle("View tree log").setView(sv)
            .setPositiveButton("Close", null).show()
    }

    private fun copyDump() {
        val t = dumpText()
        if (t.isEmpty()) { toast("No log yet."); return }
        val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        cm.setPrimaryClip(ClipData.newPlainText("FeedBlur log", t))
        toast("Copied " + t.length + " characters.")
    }

    private fun toast(s: String) = Toast.makeText(this, s, Toast.LENGTH_LONG).show()
}
