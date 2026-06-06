const { withDangerousMod, withAndroidManifest } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// ─── Java source ───────────────────────────────────────────────────────────────
function getAlarmActivityJava(pkg) {
  return `package ${pkg};

import android.animation.ObjectAnimator;
import android.animation.ValueAnimator;
import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public class AlarmActivity extends Activity {

    private MediaPlayer mediaPlayer;
    private ObjectAnimator glowAnimator;
    private ValueAnimator borderAnimator;
    private String habitId = "";
    private Handler autoFinishHandler;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // ── Wake screen and show over lock screen ──────────────────────────────
        Window window = getWindow();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            if (km != null) km.requestDismissKeyguard(this, null);
        } else {
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
            );
        }
        window.addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON |
            WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
        );

        setContentView(getResources().getIdentifier(
            "activity_alarm", "layout", getPackageName()));

        // ── Read notification data from intent extras ──────────────────────────
        Bundle extras = getIntent().getExtras();
        habitId         = str(extras, "habitId",       "");
        String name     = str(extras, "habitName",     "Habit");
        String icon     = str(extras, "habitIcon",     "\\u23F0");
        String streakS  = str(extras, "streak",        "0");
        boolean isHigh  = "true".equals(str(extras, "isHighPriority", "false"));

        // ── Find views ─────────────────────────────────────────────────────────
        View glowView   = find("glowRing");
        LinearLayout card = (LinearLayout) find("alarmCard");
        TextView labelV = (TextView) find("alarmLabel");
        TextView iconV  = (TextView) find("habitIcon");
        TextView nameV  = (TextView) find("habitName");
        TextView subV   = (TextView) find("habitSubtitle");
        TextView streakV= (TextView) find("streakBadge");
        Button doneBtn  = (Button)   find("btnDone");
        Button skipBtn  = (Button)   find("btnSkip");

        iconV.setText(icon);
        nameV.setText(name);

        int streak = 0;
        try { streak = Integer.parseInt(streakS); } catch (Exception ignored) {}
        if (streak > 0) {
            streakV.setVisibility(View.VISIBLE);
            streakV.setText("\\uD83D\\uDD25 " + streak + "d streak");
            GradientDrawable sb = pill(0xFFF4A021);
            streakV.setBackground(sb);
            streakV.setPadding(dp(10), dp(3), dp(10), dp(3));
        }

        // ── Card background ────────────────────────────────────────────────────
        final GradientDrawable cardBg = new GradientDrawable();
        cardBg.setColor(0xFFFFFFFF);
        cardBg.setCornerRadii(new float[]{dp(28),dp(28),dp(28),dp(28),0,0,0,0});

        // ── Skip button (circle) ───────────────────────────────────────────────
        skipBtn.setBackground(pill(0xFFF0EDFF));

        // ── Colours per priority ───────────────────────────────────────────────
        int accent, glowColor;
        if (isHigh) {
            accent    = 0xFFFF3B30;
            glowColor = 0xFFFF3B30;
            cardBg.setStroke(dp(4), accent);
            labelV.setText("\\u26A1 HIGH PRIORITY");
            labelV.setTextColor(accent);
            subV.setText("Your priority habit is calling — act now!");
            doneBtn.setText("\\u2705  Done Now  (+20 XP)");
            doneBtn.setBackground(pill(accent));
            startAlarmSound(true);
        } else {
            accent    = 0xFF6C3CE1;
            glowColor = 0xFF6C3CE1;
            cardBg.setStroke(dp(3), accent);
            labelV.setText("\\u23F0 HABIT ALARM");
            labelV.setTextColor(accent);
            subV.setText("Time to build your habit. Keep the streak going!");
            doneBtn.setText("\\u2705  Done Now");
            doneBtn.setBackground(pill(0xFF00C853));
            startAlarmSound(false);
        }
        card.setBackground(cardBg);

        // ── Pulsing glow behind card ───────────────────────────────────────────
        glowView.setBackgroundColor(glowColor);
        glowAnimator = ObjectAnimator.ofFloat(glowView, "alpha", 0.05f, 0.35f);
        glowAnimator.setDuration(700);
        glowAnimator.setRepeatCount(ValueAnimator.INFINITE);
        glowAnimator.setRepeatMode(ValueAnimator.REVERSE);
        glowAnimator.start();

        // ── Pulsing card border for high priority ──────────────────────────────
        if (isHigh) {
            final int strokeWidth = dp(4);
            borderAnimator = ValueAnimator.ofArgb(0xFFFF3B30, 0xFFFF9800);
            borderAnimator.setDuration(600);
            borderAnimator.setRepeatCount(ValueAnimator.INFINITE);
            borderAnimator.setRepeatMode(ValueAnimator.REVERSE);
            borderAnimator.addUpdateListener(anim -> {
                cardBg.setStroke(strokeWidth, (int) anim.getAnimatedValue());
                card.invalidate();
            });
            borderAnimator.start();
        }

        // ── Buttons ────────────────────────────────────────────────────────────
        doneBtn.setOnClickListener(v -> handleAction("done"));
        skipBtn.setOnClickListener(v -> handleAction("skip"));

        // ── Auto-dismiss after 90 seconds if no response ──────────────────────
        autoFinishHandler = new Handler(Looper.getMainLooper());
        autoFinishHandler.postDelayed(() -> handleAction("dismiss"), 90_000);
    }

    // ── Helpers ─────────────────────────────────────────────────────────────────
    private View find(String name) {
        int id = getResources().getIdentifier(name, "id", getPackageName());
        return findViewById(id);
    }
    private int dp(int v) {
        return (int)(v * getResources().getDisplayMetrics().density);
    }
    private GradientDrawable pill(int color) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(color);
        d.setCornerRadius(999f);
        return d;
    }
    private String str(Bundle b, String key, String def) {
        return b != null ? b.getString(key, def) : def;
    }

    private void startAlarmSound(boolean loop) {
        try {
            int id = getResources().getIdentifier("tick", "raw", getPackageName());
            if (id == 0) return;
            mediaPlayer = new MediaPlayer();
            mediaPlayer.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build());
            android.content.res.AssetFileDescriptor afd =
                getResources().openRawResourceFd(id);
            mediaPlayer.setDataSource(
                afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
            afd.close();
            mediaPlayer.setLooping(loop);
            mediaPlayer.setVolume(1f, 1f);
            mediaPlayer.prepare();
            mediaPlayer.start();
        } catch (Exception ignored) {}
    }

    private void stopAlarmSound() {
        if (mediaPlayer != null) {
            try {
                if (mediaPlayer.isPlaying()) mediaPlayer.stop();
                mediaPlayer.release();
            } catch (Exception ignored) {}
            mediaPlayer = null;
        }
    }

    private void handleAction(String action) {
        if (autoFinishHandler != null) autoFinishHandler.removeCallbacksAndMessages(null);
        stopAlarmSound();
        if (glowAnimator   != null) glowAnimator.cancel();
        if (borderAnimator != null) borderAnimator.cancel();
        if (!"dismiss".equals(action)) {
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW,
                    Uri.parse("hadbit://alarm?action=" + action
                        + "&habitId=" + Uri.encode(habitId)));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK |
                                Intent.FLAG_ACTIVITY_CLEAR_TOP);
                startActivity(intent);
            } catch (Exception ignored) {}
        }
        finish();
    }

    @Override
    protected void onDestroy() {
        stopAlarmSound();
        if (glowAnimator   != null) glowAnimator.cancel();
        if (borderAnimator != null) borderAnimator.cancel();
        if (autoFinishHandler != null) autoFinishHandler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }
}
`;
}

// ─── XML layout (Rapido-style bottom-sheet card) ────────────────────────────
function getAlarmLayoutXml() {
  return `<?xml version="1.0" encoding="utf-8"?>
<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:background="#CC000020">

    <!-- Pulsing ambient glow -->
    <View
        android:id="@+id/glowRing"
        android:layout_width="match_parent"
        android:layout_height="340dp"
        android:layout_gravity="bottom"
        android:alpha="0"/>

    <!-- Bottom-sheet card -->
    <LinearLayout
        android:id="@+id/alarmCard"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:layout_gravity="bottom"
        android:orientation="vertical"
        android:paddingLeft="24dp"
        android:paddingRight="24dp"
        android:paddingBottom="52dp">

        <!-- Drag handle -->
        <View
            android:layout_width="44dp"
            android:layout_height="5dp"
            android:layout_gravity="center_horizontal"
            android:layout_marginTop="12dp"
            android:layout_marginBottom="22dp"
            android:background="#CCCCCC"/>

        <!-- Alarm type label -->
        <TextView
            android:id="@+id/alarmLabel"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:text="HABIT ALARM"
            android:textSize="11sp"
            android:textStyle="bold"
            android:letterSpacing="0.12"
            android:layout_marginBottom="18dp"/>

        <!-- Icon + Name + Subtitle -->
        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:orientation="horizontal"
            android:gravity="center_vertical"
            android:layout_marginBottom="14dp">

            <TextView
                android:id="@+id/habitIcon"
                android:layout_width="76dp"
                android:layout_height="76dp"
                android:text="&#x23F0;"
                android:textSize="46sp"
                android:gravity="center"/>

            <LinearLayout
                android:layout_width="0dp"
                android:layout_height="wrap_content"
                android:layout_weight="1"
                android:orientation="vertical"
                android:layout_marginLeft="14dp">

                <TextView
                    android:id="@+id/habitName"
                    android:layout_width="match_parent"
                    android:layout_height="wrap_content"
                    android:text="Habit"
                    android:textSize="23sp"
                    android:textStyle="bold"
                    android:textColor="#1A1040"
                    android:maxLines="2"/>

                <TextView
                    android:id="@+id/habitSubtitle"
                    android:layout_width="match_parent"
                    android:layout_height="wrap_content"
                    android:text="Time to build your habit!"
                    android:textSize="13sp"
                    android:textColor="#6B6490"
                    android:layout_marginTop="5dp"/>

                <TextView
                    android:id="@+id/streakBadge"
                    android:layout_width="wrap_content"
                    android:layout_height="wrap_content"
                    android:text="&#x1F525; streak"
                    android:textSize="12sp"
                    android:textColor="#FFFFFF"
                    android:layout_marginTop="8dp"
                    android:visibility="gone"/>

            </LinearLayout>
        </LinearLayout>

        <!-- Divider -->
        <View
            android:layout_width="match_parent"
            android:layout_height="1dp"
            android:background="#EDE9FF"
            android:layout_marginBottom="20dp"/>

        <!-- Buttons: [✕ Skip]  [Done Now] -->
        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:orientation="horizontal"
            android:gravity="center_vertical">

            <Button
                android:id="@+id/btnSkip"
                android:layout_width="56dp"
                android:layout_height="56dp"
                android:text="&#x2715;"
                android:textSize="20sp"
                android:textColor="#6B6490"
                android:layout_marginRight="14dp"/>

            <Button
                android:id="@+id/btnDone"
                android:layout_width="0dp"
                android:layout_height="58dp"
                android:layout_weight="1"
                android:text="&#x2705;  Done Now"
                android:textColor="#FFFFFF"
                android:textSize="16sp"
                android:textStyle="bold"/>

        </LinearLayout>
    </LinearLayout>
</FrameLayout>
`;
}

// ─── Plugin: create files ───────────────────────────────────────────────────
function withAlarmFiles(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const root  = config.modRequest.platformProjectRoot;
      const pkg   = config.android?.package ?? 'com.app';
      const pkgDir = pkg.split('.').join('/');

      // Java file
      const javaDir = path.join(root, 'app/src/main/java', pkgDir);
      fs.mkdirSync(javaDir, { recursive: true });
      fs.writeFileSync(
        path.join(javaDir, 'AlarmActivity.java'),
        getAlarmActivityJava(pkg)
      );

      // Layout XML
      const layoutDir = path.join(root, 'app/src/main/res/layout');
      fs.mkdirSync(layoutDir, { recursive: true });
      fs.writeFileSync(path.join(layoutDir, 'activity_alarm.xml'), getAlarmLayoutXml());

      // Copy tick.mp3 → res/raw (for MediaPlayer)
      const rawDir = path.join(root, 'app/src/main/res/raw');
      fs.mkdirSync(rawDir, { recursive: true });
      const src = path.join(config.modRequest.projectRoot, 'assets', 'tick.mp3');
      const dst = path.join(rawDir, 'tick.mp3');
      if (fs.existsSync(src)) fs.copyFileSync(src, dst);

      return config;
    },
  ]);
}

// ─── Plugin: AndroidManifest ────────────────────────────────────────────────
function withAlarmManifest(config) {
  return withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application[0];
    if (!app.activity) app.activity = [];

    const alarmActivityName = '.AlarmActivity';
    const already = app.activity.some(
      (a) => a.$?.['android:name'] === alarmActivityName
    );
    if (!already) {
      app.activity.push({
        $: {
          'android:name': alarmActivityName,
          'android:showWhenLocked': 'true',
          'android:turnScreenOn': 'true',
          'android:excludeFromRecents': 'true',
          'android:taskAffinity': '',
          'android:launchMode': 'singleTask',
          'android:exported': 'true',
        },
      });
    }
    return config;
  });
}

module.exports = function withAlarmActivity(config) {
  config = withAlarmFiles(config);
  config = withAlarmManifest(config);
  return config;
};
