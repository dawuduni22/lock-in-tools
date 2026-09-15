package com.example.feedblur

import android.content.Context
import android.content.SharedPreferences

object Prefs {
    const val FILE = "feedblur"

    const val BLOCK_FEED = "block_feed"
    const val BLOCK_REELS = "block_reels"
    const val BLOCK_EXPLORE = "block_explore"
    const val BLOCK_PROFILE_REELS = "block_profile_reels"
    const val MUTE = "mute"
    const val PAUSE_MEDIA = "pause_media"
    const val BLUR = "blur"
    const val TOP_PCT = "top_pct"
    const val BOTTOM_LIFT = "bottom_lift_dp"
    const val TOP_NUDGE = "top_nudge_dp"
    const val GATE = "gate_enabled"
    const val GATE_STEPS = "gate_steps"
    const val DEBUG = "debug"
    const val SAVED_VOL = "saved_vol"
    const val STATE = "state"
    const val MUTE_ERR = "mute_err"

    fun get(c: Context): SharedPreferences =
        c.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun bool(c: Context, k: String, d: Boolean): Boolean = get(c).getBoolean(k, d)
    fun setBool(c: Context, k: String, v: Boolean) { get(c).edit().putBoolean(k, v).apply() }
    fun int(c: Context, k: String, d: Int): Int = get(c).getInt(k, d)
    fun setInt(c: Context, k: String, v: Int) { get(c).edit().putInt(k, v).apply() }
    fun str(c: Context, k: String, d: String): String = get(c).getString(k, d) ?: d
    fun setStr(c: Context, k: String, v: String) { get(c).edit().putString(k, v).apply() }
}
