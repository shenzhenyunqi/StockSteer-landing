// StockSteer landing — form + motion. No dependencies.

// Set this to your form backend (e.g. Formspree/Basin endpoint that accepts
// multipart/form-data POST). Until it's set, submissions fall back to email.
const FORM_ENDPOINT = "";

const CONTACT_EMAIL = "liu_ky@hisuntech.com";

// Entrance animations start from opacity 0, so only arm them when the page
// loads visible — hidden tabs and headless captures render the static state.
window.addEventListener("load", () => {
  if (document.visibilityState === "visible") document.body.classList.add("loaded");
});

// --- Scroll reveals ---
// Content is visible by default. Elements are hidden (.pre) only when the
// page is actually visible and they start below the fold, so hidden tabs,
// headless renderers, and no-JS visitors always see everything.
const revealEls = document.querySelectorAll(".reveal");
const revealAll = () => revealEls.forEach((el) => {
  el.classList.remove("pre");
  el.classList.add("in");
});
if ("IntersectionObserver" in window && revealEls.length && document.visibilityState === "visible") {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add("in");
        e.target.classList.remove("pre");
        io.unobserve(e.target);
      }
    }
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
  revealEls.forEach((el) => {
    if (el.getBoundingClientRect().top > window.innerHeight) {
      el.classList.add("pre");
      io.observe(el);
    }
  });
  // If the tab is hidden mid-session (screenshots, background rendering),
  // observers may stop firing — fail open to visible.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") revealAll();
  });
}

// --- CSV form ---
const form = document.getElementById("diagnosis-form");
if (form) {
  const fileInput = document.getElementById("csv");
  const drop = document.getElementById("file-drop");
  const dropText = drop.querySelector(".drop-text");
  const picked = drop.querySelector(".picked");
  const status = document.getElementById("form-status");

  const showFiles = (files) => {
    if (!files || !files.length) {
      picked.hidden = true;
      dropText.hidden = false;
      return;
    }
    picked.textContent = Array.from(files).map((f) => f.name).join(", ");
    picked.hidden = false;
    dropText.hidden = true;
  };

  fileInput.addEventListener("change", () => showFiles(fileInput.files));

  ["dragover", "dragenter"].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("drag"); })
  );
  ["dragleave", "drop"].forEach((ev) =>
    drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("drag"); })
  );
  drop.addEventListener("drop", (e) => {
    if (e.dataTransfer?.files?.length) {
      fileInput.files = e.dataTransfer.files;
      showFiles(fileInput.files);
    }
  });

  const setStatus = (kind, msg) => {
    status.className = "form-status " + kind;
    status.innerHTML = msg;
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;

    if (!FORM_ENDPOINT) {
      // No backend configured yet: hand off to email, honestly.
      const email = form.email.value;
      const store = form.store.value;
      const subject = encodeURIComponent("Allocation diagnosis request" + (store ? " — " + store : ""));
      const body = encodeURIComponent(
        "Hi StockSteer,\n\nI'd like a free allocation diagnosis.\n\nWork email: " + email +
        (store ? "\nStore: " + store : "") +
        "\nChannels: " + form.channels.value +
        "\n\n(My sales CSV is attached.)\n"
      );
      setStatus("ok",
        "Almost there — your email app should open now. <b>Attach your CSV</b> and hit send. " +
        "If nothing opened, email it to <a href=\"mailto:" + CONTACT_EMAIL + "\">" + CONTACT_EMAIL + "</a>."
      );
      window.location.href = "mailto:" + CONTACT_EMAIL + "?subject=" + subject + "&body=" + body;
      return;
    }

    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.textContent = "Sending…";
    try {
      const res = await fetch(FORM_ENDPOINT, {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      form.classList.add("sent");
      setStatus("ok", "<b>Got it.</b> Your diagnosis will be in your inbox within 48 hours. We'll reply from " + CONTACT_EMAIL + ".");
      status.scrollIntoView({ block: "center", behavior: "smooth" });
    } catch {
      setStatus("err",
        "That didn't go through. Please email your CSV to <a href=\"mailto:" + CONTACT_EMAIL + "\">" + CONTACT_EMAIL + "</a> — same 48-hour turnaround."
      );
    } finally {
      btn.disabled = false;
      btn.textContent = "Send my CSV — get my diagnosis";
    }
  });
}
