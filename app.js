// ============================================================
// FUTURE YOU
// Plain JavaScript + Supabase
// ============================================================

// ============================================================
// 1. SUPABASE SETUP
// ============================================================
const SUPABASE_URL = "https://pslejijxvunsiwmyllzf.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_a0unrSpTo8-9-cibuZLoHw_sPKFXvcT";


const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);
 
const VAPID_PUBLIC_KEY = "BA_oTrvbbhNMHSz0uHlbb3JHAmpwc2ogvKQpmSsIxMesZik9bbniuzJtGzwxsUBaF1O87MhfmClYYfgTolALl7k";

async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('Service worker registered:', registration);
      return registration;
    } catch (error) {
      console.error('Service worker registration failed:', error);
    }
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}
async function enablePushNotifications() {
  alert("Button clicked, function started");

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    alert('Notifications need to be allowed for check-in reminders to work.');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    const { error } = await supabaseClient.from("push_subscriptions").upsert(
      { user_id: state.user.id, subscription: subscription.toJSON() },
      { onConflict: "user_id" }
    );

    if (error) {
      alert("DB SAVE ERROR: " + JSON.stringify(error));
    } else {
      alert("Push subscription saved successfully!");
    }
  } catch (err) {
    alert("SUBSCRIBE ERROR: " + err.message);
  }
}


// ============================================================
// 2. APP STATE
// ============================================================

const state = {
  user: null,

  tasks: [],

  todayEntries: {},

  history: [],

  currentTab: "home",

  activeRecordTask: null,

  activeCheckinTask: null,

  mediaRecorder: null,

  recordedChunks: [],

  recordSeconds: 0,

  recordInterval: null,

  checkinAnswer: null,

  checkinReason: null
};


// ============================================================
// 3. HELPER FUNCTIONS
// ============================================================

function getLocalDateString() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}


function to12h(time) {
  if (!time) {
    return "--:--";
  }

  const parts = time.split(":");

  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);

  const period = hours >= 12 ? "PM" : "AM";

  const hour12 =
    hours % 12 === 0
      ? 12
      : hours % 12;

  return `${hour12}:${String(minutes).padStart(2, "0")} ${period}`;
}


function nowMinutes() {
  const now = new Date();

  return (
    now.getHours() * 60 +
    now.getMinutes()
  );
}


function timeToMinutes(time) {
  if (!time) {
    return 0;
  }

  const parts = time.split(":");

  return (
    Number(parts[0]) * 60 +
    Number(parts[1])
  );
}


// ============================================================
// 4. SCREEN NAVIGATION
// ============================================================

function showScreen(id) {
  document
    .querySelectorAll(".screen")
    .forEach((screen) => {
      screen.classList.add("hidden");
    });

  const screen = document.getElementById(id);

  if (screen) {
    screen.classList.remove("hidden");
  }
}


function showOverlay(id) {
  const overlay = document.getElementById(id);

  if (overlay) {
    overlay.classList.remove("hidden");
  }
}


function hideOverlay(id) {
  const overlay = document.getElementById(id);

  if (overlay) {
    overlay.classList.add("hidden");
  }
}


function switchTab(tab) {
  state.currentTab = tab;

  document
    .querySelectorAll(".nav-btn")
    .forEach((button) => {
      button.classList.toggle(
        "active",
        button.dataset.tab === tab
      );
    });

  showScreen(`screen-${tab}`);

  if (tab === "home") {
    renderHome();
  }
  
  if (tab === "progress") {
    renderProgress();
  }

  if (tab === "settings") {
    renderSettings();
  }
}
document.getElementById("btn-settings-add-task").addEventListener("click", async () => {
  const label = document.getElementById("settings-new-task-label").value.trim();
  const recordTime = document.getElementById("settings-new-task-record-time").value;
  const checkinTime = document.getElementById("settings-new-task-checkin-time").value;

  if (!label || !recordTime || !checkinTime) {
    alert("Please fill in the task name and both times.");
    return;
  }
  if (state.tasks.length >= 4) {
    alert("You can only track up to 4 tasks at once.");
    return;
  }

  const { error } = await supabaseClient.from("goals").insert({
    user_id: state.user.id,
    label,
    record_time: recordTime,
    checkin_time: checkinTime,
  });

  if (error) {
    alert("Could not add task: " + error.message);
    return;
  }

  document.getElementById("settings-new-task-label").value = "";
  document.getElementById("settings-new-task-record-time").value = "";
  document.getElementById("settings-new-task-checkin-time").value = "";

  await loadTasks();
  renderSettings();
});


document
  .querySelectorAll(".nav-btn")
  .forEach((button) => {
    button.addEventListener("click", () => {
      switchTab(button.dataset.tab);
    });
  });


// ============================================================
// 5. AUTHENTICATION
// ============================================================

async function signUp() {
  const email =
    document
      .getElementById("auth-email")
      .value
      .trim();

  const password =
    document
      .getElementById("auth-password")
      .value;

  const errorBox =
    document.getElementById("auth-error");

  errorBox.textContent = "";

  if (!email || !password) {
    errorBox.textContent =
      "Please enter your email and password.";

    return;
  }

  const {
    data,
    error
  } = await supabaseClient.auth.signUp({
    email,
    password
  });

  if (error) {
    console.error("Sign up error:", error);

    errorBox.textContent =
      error.message;

    return;
  }

  state.user = data.user;

  if (!data.session) {
    errorBox.textContent =
      "Check your email to confirm your account, then come back and log in.";

    return;
  }

  await afterLogin();
}


async function login() {
  const email =
    document
      .getElementById("auth-email")
      .value
      .trim();

  const password =
    document
      .getElementById("auth-password")
      .value;

  const errorBox =
    document.getElementById("auth-error");

  errorBox.textContent = "";

  if (!email || !password) {
    errorBox.textContent =
      "Please enter your email and password.";

    return;
  }

  const {
    data,
    error
  } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    console.error("Login error:", error);

    errorBox.textContent =
      error.message;

    return;
  }

  state.user = data.user;

  await afterLogin();
}


document
  .getElementById("btn-signup")
  .addEventListener("click", signUp);


document
  .getElementById("btn-login")
  .addEventListener("click", login);

document.getElementById("btn-enable-notifications").addEventListener("click", async () => {
  await registerServiceWorker();
  await enablePushNotifications();
});

document
  .getElementById("btn-logout")
  .addEventListener("click", async () => {

    await supabaseClient.auth.signOut();

    state.user = null;
    state.tasks = [];
    state.todayEntries = {};
    state.history = {};

    showScreen("screen-auth");
  });


// ============================================================
// 6. AFTER LOGIN
// ============================================================

async function afterLogin() {
  if (!state.user) {
    return;
  }

  console.log(
    "Logged in as:",
    state.user.email
  );

  await loadTasks();

  if (state.tasks.length === 0) {

    onboardingTasks = [];

    renderOnboardingList();

    showScreen("screen-onboarding");

    return;
  }

  await loadTodayEntries();

  await loadHistory();

  switchTab("home");
}


// ============================================================
// 7. LOAD TASKS
// ============================================================

async function loadTasks() {

  const {
    data,
    error
  } = await supabaseClient
    .from("goals")
    .select("*")
    .eq("user_id", state.user.id)
    .order("created_at", {
      ascending: true
    });

  if (error) {
    console.error(
      "loadTasks error:",
      error
    );

    state.tasks = [];

    return;
  }

  state.tasks = data || [];

  console.log(
    "Tasks loaded:",
    state.tasks
  );
}


// ============================================================
// 8. LOAD TODAY'S ENTRIES
// ============================================================

async function loadTodayEntries() {

  const today =
    getLocalDateString();

  const {
    data,
    error
  } = await supabaseClient
    .from("daily_entries")
    .select(`
      *,
      goal_completions(*)
    `)
    .eq("user_id", state.user.id)
    .eq("date", today);

  state.todayEntries = {};

  if (error) {
    console.error(
      "loadTodayEntries error:",
      error
    );

    return;
  }

  if (!data) {
    return;
  }

  data.forEach((entry) => {

    const completion = Array.isArray(entry.goal_completions)
  ? entry.goal_completions[0]
  : entry.goal_completions || null;

    state.todayEntries[
      entry.goal_id
    ] = {
      audioUrl: entry.audio_url,
      completed:
        completion
          ? completion.completed
          : null,
      reason:
        completion
          ? completion.reason
          : null
    };
  });
}


// ============================================================
// 9. LOAD HISTORY
// ============================================================

async function loadHistory() {

  const sevenDaysAgo =
    new Date();

  sevenDaysAgo.setDate(
    sevenDaysAgo.getDate() - 7
  );

  const dateString =
    `${sevenDaysAgo.getFullYear()}-` +
    `${String(
      sevenDaysAgo.getMonth() + 1
    ).padStart(2, "0")}-` +
    `${String(
      sevenDaysAgo.getDate()
    ).padStart(2, "0")}`;

  const {
    data,
    error
  } = await supabaseClient
    .from("daily_entries")
    .select(`
      *,
      goal_completions(*)
    `)
    .eq("user_id", state.user.id)
    .gte("date", dateString)
    .order("date", {
      ascending: true
    });

  if (error) {
    console.error(
      "loadHistory error:",
      error
    );

    state.history = [];

    return;
  }

  state.history = data || [];
}


// ============================================================
// 10. ONBOARDING
// ============================================================

let onboardingTasks = [];


function renderOnboardingList() {

  const list =
    document.getElementById(
      "onboarding-task-list"
    );

  list.innerHTML = "";

  onboardingTasks.forEach(
    (task, index) => {

      const div =
        document.createElement("div");

      div.className =
        "task-card";

      div.innerHTML = `
        <div class="task-card-header">
          <span class="label">
            ${escapeHtml(task.label)}
          </span>

          <button
            class="remove-btn"
            data-index="${index}"
          >
            ✕
          </button>
        </div>

        <div class="progress-meta">
          Record ${to12h(task.record_time)}
          ·
          Check in ${to12h(task.checkin_time)}
        </div>
      `;

      list.appendChild(div);
    }
  );

  list
    .querySelectorAll(".remove-btn")
    .forEach((button) => {

      button.addEventListener(
        "click",
        () => {

          const index =
            Number(button.dataset.index);

          onboardingTasks.splice(
            index,
            1
          );

          renderOnboardingList();
        }
      );
    });
}


document
  .getElementById("btn-add-task")
  .addEventListener(
    "click",
    () => {

      const label =
        document
          .getElementById(
            "new-task-label"
          )
          .value
          .trim();

      const recordTime =
        document
          .getElementById(
            "new-task-record-time"
          )
          .value;

      const checkinTime =
        document
          .getElementById(
            "new-task-checkin-time"
          )
          .value;

      if (
        !label ||
        !recordTime ||
        !checkinTime
      ) {
        alert(
          "Please enter a task and both times."
        );

        return;
      }

      if (
        onboardingTasks.length >= 4
      ) {
        alert(
          "You can add up to 4 tasks."
        );

        return;
      }

      onboardingTasks.push({
        label,
        record_time: recordTime,
        checkin_time: checkinTime
      });

      document
        .getElementById(
          "new-task-label"
        )
        .value = "";

      document
        .getElementById(
          "new-task-record-time"
        )
        .value = "";

      document
        .getElementById(
          "new-task-checkin-time"
        )
        .value = "";

      renderOnboardingList();
    }
  );


document
  .getElementById(
    "btn-finish-onboarding"
  )
  .addEventListener(
    "click",
    async () => {

      if (
        onboardingTasks.length === 0
      ) {
        alert(
          "Add at least one task first."
        );

        return;
      }

      const rows =
        onboardingTasks.map(
          (task) => ({
            user_id:
              state.user.id,

            label:
              task.label,

            record_time:
              task.record_time,

            checkin_time:
              task.checkin_time
          })
        );

      const {
        error
      } = await supabaseClient
        .from("goals")
        .insert(rows);

      if (error) {
        console.error(
          "Could not save tasks:",
          error
        );

        alert(
          "Could not save tasks:\n\n" +
          error.message
        );

        return;
      }

      onboardingTasks = [];

      await loadTasks();

      await loadTodayEntries();

      await loadHistory();

      switchTab("home");
    }
  );


// ============================================================
// 11. HOME SCREEN
// ============================================================

function renderHome() {

  const list =
    document.getElementById(
      "home-task-list"
    );

  list.innerHTML = "";
  function renderHomeHeroStreak() {
  let bestStreak = 0;

  state.tasks.forEach((task) => {
    const taskHistory = state.history.filter((h) => h.goal_id === task.id);
    const sorted = [...taskHistory].sort((a, b) => b.date.localeCompare(a.date));

    let streak = 0;
    for (const entry of sorted) {
      const completion = Array.isArray(entry.goal_completions)
        ? entry.goal_completions[0]
        : entry.goal_completions || null;
      if (completion?.completed === true) streak++;
      else break;
    }

    if (streak > bestStreak) bestStreak = streak;
  });

  document.getElementById("home-hero-streak").textContent = bestStreak;
}
renderHomeHeroStreak();
  state.tasks.forEach((task) => {

    const entry =
      state.todayEntries[
        task.id
      ];

    const hasRecording =
      Boolean(entry?.audioUrl);

    const completed =
      entry?.completed;


    const div = document.createElement("div");
     let extraClass = "";
     if (hasRecording && completed === null) extraClass = " checkin-ready";
     if (completed === true) extraClass = " completed-yes";
     if (completed === false) extraClass = " completed-no";
     div.className = "home-task" + extraClass;

    let statusIcon = "→";

    if (completed === true) {
      statusIcon = "✓";
    }

    if (completed === false) {
      statusIcon = "✕";
    }

    if (
      hasRecording &&
      completed === null
    ) {
      statusIcon = "🎧";
    }

    div.innerHTML = `
      <div>
        <div class="label">
          ${escapeHtml(task.label)}
        </div>

        <div class="meta">
          Record ${to12h(task.record_time)}
          ·
          Check-in ${to12h(task.checkin_time)}
        </div>
      </div>

      <div class="status">
        ${statusIcon}
      </div>
    `;

    div.addEventListener(
      "click",
      () => {

        if (!hasRecording) {
          openRecordOverlay(task);

          return;
        }

        if (completed === null) {
          openCheckinOverlay(
            task,
            entry.audioUrl
          );
        }
      }
    );

    list.appendChild(div);
  });

  renderReminderBanner();
}


function renderReminderBanner() {

  const banner =
    document.getElementById(
      "reminder-banner"
    );

  const now =
    nowMinutes();
   console.log("now:", now, "tasks:", state.tasks.map(t => ({label: t.label, recordTime: t.record_time, hasRecording: !!state.todayEntries[t.id]?.audioUrl}

   )
  )
);
  const dueRecord =
    state.tasks.find(
      (task) => {

        const entry =
          state.todayEntries[
            task.id
          ];

        return (
          now >=
            timeToMinutes(
              task.record_time
            ) &&
          !entry?.audioUrl
        );
      }
    );

  if (dueRecord) {

    banner.textContent =
      `🎙️ Time to record "${dueRecord.label}" — tap it below`;

    banner.classList.remove(
      "hidden"
    );

  } else {

    banner.classList.add(
      "hidden"
    );
  }
}


// ============================================================
// 12. RECORDING WAVEFORM
// ============================================================

function buildWaveform(
  containerId,
  animate
) {

  const container =
    document.getElementById(
      containerId
    );

  if (!container) {
    return;
  }

  container.innerHTML = "";

  const heights = [
    8, 22, 14, 30, 18,
    26, 10, 34, 20, 12,
    28, 16, 24, 9, 32,
    19, 27, 13, 21, 11
  ];

  heights.forEach((height) => {

    const bar =
      document.createElement(
        "div"
      );

    bar.className =
      "bar";

    if (animate) {
      bar.classList.add(
        "animating"
      );
    } else {
      bar.style.height =
        Math.max(
          height * 0.7,
          4
        ) + "px";
    }

    container.appendChild(bar);
  });
}


// ============================================================
// 13. OPEN RECORDING
// ============================================================

function openRecordOverlay(task) {

  state.activeRecordTask =
    task;

  document
    .getElementById(
      "record-time-label"
    )
    .textContent =
      to12h(
        task.record_time
      );

  document
    .getElementById(
      "record-task-label"
    )
    .textContent =
      `Record: ${task.label}`;

  document
    .getElementById(
      "record-status"
    )
    .classList.add(
      "hidden"
    );

  const doneButton =
    document.getElementById(
      "btn-record-done"
    );

  doneButton.disabled = true;

  doneButton.textContent =
    "Done";

  document
    .getElementById(
      "record-timer"
    )
    .textContent =
      "00:00";

  buildWaveform(
    "record-waveform",
    false
  );

  const micButton =
    document.getElementById(
      "btn-mic"
    );

  micButton.classList.remove(
    "recording"
  );

  showOverlay(
    "overlay-record"
  );
}


// ============================================================
// 14. CANCEL RECORDING
// ============================================================

document
  .getElementById(
    "btn-record-cancel"
  )
  .addEventListener(
    "click",
    () => {

      if (
        state.mediaRecorder &&
        state.mediaRecorder.state !==
          "inactive"
      ) {

        state.mediaRecorder.stop();

        state.mediaRecorder.stream
          .getTracks()
          .forEach(
            (track) =>
              track.stop()
          );
      }

      clearInterval(
        state.recordInterval
      );

      state.recordInterval =
        null;

      state.mediaRecorder =
        null;

      hideOverlay(
        "overlay-record"
      );
    }
  );


// ============================================================
// 15. START / STOP RECORDING
// ============================================================

document
  .getElementById(
    "btn-mic"
  )
  .addEventListener(
    "click",
    async () => {

      const micButton =
        document.getElementById(
          "btn-mic"
        );

      const doneButton =
        document.getElementById(
          "btn-record-done"
        );

      if (
        !state.mediaRecorder ||
        state.mediaRecorder.state ===
          "inactive"
      ) {

        try {

          const stream =
            await navigator
              .mediaDevices
              .getUserMedia({
                audio: true
              });

          state.recordedChunks =
            [];

          state.mediaRecorder =
            new MediaRecorder(
              stream
            );

          state.mediaRecorder
            .ondataavailable =
            (event) => {

              if (
                event.data &&
                event.data.size > 0
              ) {
                state.recordedChunks.push(
                  event.data
                );
              }
            };

          state.mediaRecorder.start();

          micButton.classList.add(
            "recording"
          );

          doneButton.disabled =
            true;

          buildWaveform(
            "record-waveform",
            true
          );

          state.recordSeconds =
            0;

          document
            .getElementById(
              "record-timer"
            )
            .textContent =
            "00:00";

          state.recordInterval =
            setInterval(
              () => {

                state.recordSeconds++;

                const minutes =
                  String(
                    Math.floor(
                      state.recordSeconds /
                        60
                    )
                  ).padStart(
                    2,
                    "0"
                  );

                const seconds =
                  String(
                    state.recordSeconds %
                      60
                  ).padStart(
                    2,
                    "0"
                  );

                document
                  .getElementById(
                    "record-timer"
                  )
                  .textContent =
                  `${minutes}:${seconds}`;
              },
              1000
            );

        } catch (error) {

          console.error(
            "Microphone error:",
            error
          );

          alert(
            "Microphone access is needed.\n\n" +
            error.message
          );
        }

      } else {

        state.mediaRecorder.stop();

        state.mediaRecorder.stream
          .getTracks()
          .forEach(
            (track) =>
              track.stop()
          );

        clearInterval(
          state.recordInterval
        );

        state.recordInterval =
          null;

        state.mediaRecorder =
          null;

        micButton.classList.remove(
          "recording"
        );

        buildWaveform(
          "record-waveform",
          false
        );

        document
          .getElementById(
            "record-status"
          )
          .classList.remove(
            "hidden"
          );

        doneButton.disabled =
          false;
      }
    }
  );


// ============================================================
// 16. SAVE RECORDING
// ============================================================

document
  .getElementById(
    "btn-record-done"
  )
  .addEventListener(
    "click",
    async () => {

      const button =
        document.getElementById(
          "btn-record-done"
        );

      button.disabled = true;

      button.textContent =
        "Saving...";

      try {

        const task =
          state.activeRecordTask;

        if (!task) {
          throw new Error(
            "No active task found."
          );
        }

        if (
          !state.recordedChunks ||
          state.recordedChunks.length === 0
        ) {
          throw new Error(
            "No recording data was captured."
          );
        }

        const blob =
          new Blob(
            state.recordedChunks,
            {
              type: "audio/webm"
            }
          );

        const today =
          getLocalDateString();

        const fileName =
          `${state.user.id}/${task.id}/${today}.webm`;

        console.log(
          "Saving recording..."
        );

        console.log(
          "User ID:",
          state.user.id
        );

        console.log(
          "Task ID:",
          task.id
        );

        console.log(
          "File:",
          fileName
        );


        // --------------------------------------------
        // STORAGE UPLOAD
        // --------------------------------------------

        const {
          error: uploadError
        } =
          await supabaseClient
            .storage
            .from("voice-notes")
            .upload(
              fileName,
              blob,
              {
                upsert: true,
                contentType:
                  "audio/webm"
              }
            );

        if (uploadError) {

          console.error(
            "STORAGE UPLOAD ERROR:",
            uploadError
          );

          alert(
            "STORAGE UPLOAD ERROR\n\n" +
            uploadError.message +
            "\n\nCode: " +
            (
              uploadError.statusCode ||
              uploadError.status ||
              "unknown"
            )
          );

          return;
        }

        console.log(
          "Audio uploaded successfully."
        );


        // --------------------------------------------
        // PUBLIC URL
        // --------------------------------------------

        const {
          data: urlData
        } =
          supabaseClient
            .storage
            .from("voice-notes")
            .getPublicUrl(
              fileName
            );

        const audioUrl =
          urlData.publicUrl;

        console.log(
          "Audio URL:",
          audioUrl
        );


        // --------------------------------------------
        // DAILY ENTRY
        // --------------------------------------------

        const {
          error: insertError
        } =
          await supabaseClient
            .from("daily_entries")
            .upsert(
              {
                user_id:
                  state.user.id,

                goal_id:
                  task.id,

                date:
                  today,

                audio_url:
                  audioUrl
              },
              {
                onConflict:
                  "user_id,goal_id,date"
              }
            );

        if (insertError) {

          console.error(
            "DAILY ENTRY ERROR:",
            insertError
          );

          alert(
            "DAILY ENTRY ERROR\n\n" +
            insertError.message +
            "\n\nCode: " +
            (
              insertError.code ||
              "unknown"
            )
          );

          return;
        }

        console.log(
          "Daily entry saved successfully."
        );


        // --------------------------------------------
        // UPDATE STATE
        // --------------------------------------------

        state.todayEntries[
          task.id
        ] = {
          audioUrl:
            audioUrl,

          completed:
            null,

          reason:
            null
        };

        hideOverlay(
          "overlay-record"
        );

        renderHome();

      } catch (error) {

        console.error(
          "Unexpected recording error:",
          error
        );

        alert(
          "UNEXPECTED ERROR\n\n" +
          (
            error.message ||
            String(error)
          )
        );

      } finally {

        button.disabled =
          false;

        button.textContent =
          "Done";
      }
    }
  );


// ============================================================
// 17. CHECK-IN
// ============================================================

function openCheckinOverlay(
  task,
  audioUrl
) {

  state.activeCheckinTask =
    task;

  state.checkinAnswer =
    null;

  state.checkinReason =
    null;

  document
    .getElementById(
      "checkin-time-label"
    )
    .textContent =
    to12h(
      task.checkin_time
    );

  document
    .getElementById(
      "checkin-task-label"
    )
    .textContent =
    `Morning-you on "${task.label}"`;

  document
    .getElementById(
      "checkin-question"
    )
    .classList.add(
      "hidden"
    );

  document
    .getElementById(
      "reason-picker"
    )
    .classList.add(
      "hidden"
    );

  document
    .getElementById(
      "btn-checkin-save"
    )
    .disabled = true;

  document
    .querySelectorAll(
      ".btn-yesno"
    )
    .forEach(
      (button) => {
        button.classList.remove(
          "selected"
        );
      }
    );

  document
    .querySelectorAll(
      ".btn-reason"
    )
    .forEach(
      (button) => {
        button.classList.remove(
          "selected"
        );
      }
    );

  buildWaveform(
    "checkin-waveform",
    false
  );

  const audio =
    document.getElementById(
      "playback-audio"
    );

  audio.pause();

  audio.currentTime =
    0;

  audio.src =
    audioUrl;

  showOverlay(
    "overlay-checkin"
  );
}


// ============================================================
// 18. PLAY VOICE NOTE
// ============================================================

document
  .getElementById(
    "btn-play"
  )
  .addEventListener(
    "click",
    async () => {

      const audio =
        document.getElementById(
          "playback-audio"
        );

      try {

        buildWaveform(
          "checkin-waveform",
          true
        );

        await audio.play();

      } catch (error) {

        console.error(
          "Audio playback error:",
          error
        );

        buildWaveform(
          "checkin-waveform",
          false
        );

        alert(
          "Could not play the recording.\n\n" +
          error.message
        );

        return;
      }

      audio.onended =
        () => {

          buildWaveform(
            "checkin-waveform",
            false
          );

          document
            .getElementById(
              "checkin-question"
            )
            .classList.remove(
              "hidden"
            );
        };
    }
  );


// ============================================================
// 19. YES / NO
// ============================================================

document
  .querySelectorAll(
    ".btn-yesno"
  )
  .forEach(
    (button) => {

      button.addEventListener(
        "click",
        () => {

          state.checkinAnswer =
            button.dataset.answer ===
            "yes";

          document
            .querySelectorAll(
              ".btn-yesno"
            )
            .forEach(
              (other) => {
                other.classList.remove(
                  "selected"
                );
              }
            );

          button.classList.add(
            "selected"
          );

          const reasonPicker =
            document.getElementById(
              "reason-picker"
            );

          const saveButton =
            document.getElementById(
              "btn-checkin-save"
            );

          if (
            !state.checkinAnswer
          ) {

            reasonPicker.classList.remove(
              "hidden"
            );

            saveButton.disabled =
              true;

          } else {

            reasonPicker.classList.add(
              "hidden"
            );

            state.checkinReason =
              null;

            saveButton.disabled =
              false;
          }
        }
      );
    }
  );


// ============================================================
// 20. REASON PICKER
// ============================================================

document
  .querySelectorAll(
    ".btn-reason"
  )
  .forEach(
    (button) => {

      button.addEventListener(
        "click",
        () => {

          state.checkinReason =
            button.dataset.reason;

          document
            .querySelectorAll(
              ".btn-reason"
            )
            .forEach(
              (other) => {
                other.classList.remove(
                  "selected"
                );
              }
            );

          button.classList.add(
            "selected"
          );

          document
            .getElementById(
              "btn-checkin-save"
            )
            .disabled =
            false;
        }
      );
    }
  );


// ============================================================
// 21. SAVE CHECK-IN
// ============================================================

document
  .getElementById(
    "btn-checkin-save"
  )
  .addEventListener(
    "click",
    async () => {

      const button =
        document.getElementById(
          "btn-checkin-save"
        );

      button.disabled =
        true;

      button.textContent =
        "Saving...";

      try {

        const task =
          state.activeCheckinTask;

        const today =
          getLocalDateString();

        if (!task) {
          throw new Error(
            "No active check-in task."
          );
        }

        if (
          state.checkinAnswer ===
          null
        ) {
          throw new Error(
            "Please choose Yes or Not yet."
          );
        }

        if (
          state.checkinAnswer ===
            false &&
          !state.checkinReason
        ) {
          throw new Error(
            "Please choose what got in the way."
          );
        }


        // Find today's entry

        const {
          data: entryRow,
          error: entryError
        } =
          await supabaseClient
            .from("daily_entries")
            .select("id")
            .eq(
              "user_id",
              state.user.id
            )
            .eq(
              "goal_id",
              task.id
            )
            .eq(
              "date",
              today
            )
            .single();

        if (entryError) {

          console.error(
            "Entry lookup error:",
            entryError
          );

          throw new Error(
            "Could not find today's voice entry: " +
            entryError.message
          );
        }


        // Save completion

        const {
          error
        } =
          await supabaseClient
            .from(
              "goal_completions"
            )
            .upsert(
              {
                daily_entry_id:
                  entryRow.id,

                completed:
                  state.checkinAnswer,

                reason:
                  state.checkinReason
              },
              {
                onConflict:
                  "daily_entry_id"
              }
            );

        if (error) {

          console.error(
            "Check-in save error:",
            error
          );

          throw error;
        }


        // Update local state

        state.todayEntries[
          task.id
        ].completed =
          state.checkinAnswer;

        state.todayEntries[task.id].reason = state.checkinReason;

       await loadHistory();
       hideOverlay("overlay-checkin");
       renderHome();
       renderProgress();        
      } catch (error) {

        console.error(
          "Check-in error:",
          error
        );

        alert(
          "Could not save check-in:\n\n" +
          (
            error.message ||
            String(error)
          )
        );

      } finally {

        button.disabled =
          false;

        button.textContent =
          "Save";
      }
    }
  );


// ============================================================
// 22. PROGRESS
// ============================================================
function renderProgress() {
  const list = document.getElementById("progress-list");
  list.innerHTML = "";

  // Calculate total completions across all tasks for the hero number
  let totalCompleted = 0;
  state.history.forEach((entry) => {
    const completion = Array.isArray(entry.goal_completions)
      ? entry.goal_completions[0]
      : entry.goal_completions || null;
    if (completion?.completed === true) totalCompleted++;
  });
  document.getElementById("progress-hero-total").textContent = totalCompleted;

  state.tasks.forEach(
    (task) => {

      const taskHistory =
        state.history.filter(
          (entry) =>
            entry.goal_id ===
            task.id
        );

      const completionByDate =
        taskHistory.map(
          (entry) => {

           const completion = Array.isArray(entry.goal_completions)
  ? entry.goal_completions[0]
  : entry.goal_completions || null;
            return {
              date:
                entry.date,

              completed:
                completion
                  ? completion.completed
                  : null
            };
          }
        );


      // Count completed days

      const weekCount =
        completionByDate.filter(
          (item) =>
            item.completed === true
        ).length;

      // ...everything below this stays exactly as it already is in your file

      // Calculate streak

      let streak = 0;

      const sorted =
        [...completionByDate]
          .sort(
            (a, b) =>
              b.date.localeCompare(
                a.date
              )
          );

      for (
        const item of sorted
      ) {

        if (
          item.completed === true
        ) {
          streak++;
        } else {
          break;
        }
      }


      const totalDays =
        completionByDate.length;

      const pct =
        totalDays > 0
          ? Math.round(
              (weekCount /
                totalDays) *
                100
            )
          : 0;


      const div =
        document.createElement(
          "div"
        );

      div.className =
        "progress-card";

      div.innerHTML = `
        <div class="progress-card-header">

          <span class="label">
            ${escapeHtml(task.label)}
          </span>

          <span class="streak">
            ${streak}-day streak
          </span>

        </div>

        <div class="progress-bar-bg">

          <div
            class="progress-bar-fill"
            style="width:${pct}%"
          ></div>

        </div>

        <div class="progress-meta">
          ${weekCount}/${totalDays || 0}
          completed ·
          ${pct}% consistent
        </div>
      `;

      list.appendChild(div);
    }
  );
}


// ============================================================
// 23. SETTINGS
// ============================================================

function renderSettings() {
  const list = document.getElementById("settings-task-list");
  list.innerHTML = "";

  state.tasks.forEach((task) => {
    const div = document.createElement("div");
    div.className = "task-card";
    div.innerHTML = `
      <div class="task-card-header">
        <span class="label">${escapeHtml(task.label)}</span>
        <button class="remove-btn" data-task-id="${task.id}">✕</button>
      </div>
      <div class="progress-meta">
        Record ${to12h(task.record_time)} · Check in ${to12h(task.checkin_time)}
      </div>
    `;
    list.appendChild(div);
  });

  list.querySelectorAll(".remove-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const taskId = button.dataset.taskId;
      const confirmDelete = confirm("Delete this task? This will also remove its recordings and history.");
      if (!confirmDelete) return;

      const { error } = await supabaseClient.from("goals").delete().eq("id", taskId);
      if (error) {
        alert("Could not delete task: " + error.message);
        return;
      }

      await loadTasks();
      await loadTodayEntries();
      await loadHistory();
      renderSettings();
    });
  });
}

// ============================================================
// 24. SAFE HTML HELPER
// ============================================================

function escapeHtml(value) {

  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


// ============================================================
// 25. AUTH STATE LISTENER
// ============================================================

supabaseClient.auth.onAuthStateChange(
  async (event, session) => {

    console.log(
      "Supabase auth event:",
      event
    );

    if (
      session &&
      session.user
    ) {

      state.user =
        session.user;

      if (
        event === "SIGNED_IN" ||
        event === "INITIAL_SESSION"
      ) {
        await afterLogin();
      }

    } else {

      state.user = null;
    }
  }
);


// ============================================================
// 26. INITIALIZE
// ============================================================
async function handleNotificationDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const taskId = params.get("task");
  const action = params.get("action");

  if (!taskId || !action) return;

  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return;

  if (action === "record") {
    openRecordOverlay(task);
  } else if (action === "checkin") {
    const entry = state.todayEntries[taskId];
    if (entry?.audioUrl) {
      openCheckinOverlay(task, entry.audioUrl);
    }
  }

  window.history.replaceState({}, document.title, window.location.pathname);
}

  // ...your existing init function stays here

async function init() {

  console.log(
    "Future You starting..."
  );

  try {

    const {
      data,
      error
    } =
      await supabaseClient.auth.getSession();

    if (error) {

      console.error(
        "Session error:",
        error
      );

      showScreen(
        "screen-auth"
      );

      return;
    }

    if (
      data &&
      data.session
    ) {

      state.user =
        data.session.user;

      await afterLogin();
      await handleNotificationDeepLink();

    } else {

      showScreen(
        "screen-auth"
      );
    }

  } catch (error) {

    console.error(
      "Initialization error:",
      error
    );

    showScreen(
      "screen-auth"
    );
  }
}


init();