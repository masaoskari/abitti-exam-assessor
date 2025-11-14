document.getElementById("injectButton").addEventListener("click", async () => {
  const annotationInput =
    document.getElementById("annotationInput").value || "";
  console.log("[popup] Annotation input:", annotationInput);

  if (!annotationInput.trim()) {
    console.warn("[popup] annotation is empty");
    return;
  }

  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    console.log("[popup] Active tab:", tab);
    if (!tab || !tab.id) {
      console.error("[popup] no active tab");
      return;
    }

    chrome.scripting
      .executeScript({
        target: { tabId: tab.id },
        func: injectedMain,
        args: [annotationInput.trim()],
      })
      .then(() => {
        console.log("[popup] Injection script dispatched");
      })
      .catch((err) => {
        console.error("[popup] executeScript error:", err);
      });
  } catch (e) {
    console.error("[popup] error:", e);
  }
});

function injectedMain(annotationMessage) {
  const L = (...args) => console.log("[injected]", ...args);
  const W = (...args) => console.warn("[injected]", ...args);
  const E = (...args) => console.error("[injected]", ...args);

  (async () => {
    L("Start with annotation:", annotationMessage);

    let answerId = null;
    try {
      const input = document.querySelector("input.scorePoints[data-answer-id]");
      if (input && input.dataset.answerId) answerId = input.dataset.answerId;
      if (!answerId) {
        const td = document.querySelector(
          "td.answerScore[data-answer-id], td[data-answer-id]"
        );
        if (td) answerId = td.getAttribute("data-answer-id");
      }
    } catch (e) {
      W("Error reading answerId", e);
    }
    L("AnswerId found:", answerId);

    if (!answerId) {
      W("No answerId found; aborting POST");
      return;
    }

    const payload = {
      metadata: {
        annotations: [
          {
            type: "rect",
            attachmentIndex: 0,
            x: 0.2923632218844985,
            y: 0.14361702127659576,
            width: 0.2887537993920972,
            height: 0.26595744680851063,
            message: annotationMessage,
          },
        ],
      },
    };

    const url = `${location.origin}/exam-api/grading/metadata/${answerId}`;
    L("Posting to", url);
    L("Payload:", payload);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      L("Response status:", res.status);
      if (res.ok || res.status === 204) {
        L("POST success — reloading page...");
        location.reload(); // 🔄 Force page refresh
      } else {
        W("POST failed with status:", res.status);
      }
    } catch (err) {
      E("Fetch error:", err);
    }
  })();
}
