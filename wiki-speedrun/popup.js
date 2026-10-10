const form = document.querySelector("#challenge-form");
const startButton = document.querySelector("#start-button");
const endButton = document.querySelector("#end-button");
const statusSection = document.querySelector("#challenge-status");
const statusText = document.querySelector("#status-text");
const errorMessage = document.querySelector("#error-message");

function elapsedText(startedAt, endedAt = Date.now()) {
  if (startedAt === null) {
    return "waiting for the start page";
  }
  const totalSeconds = Math.max(0, Math.floor((endedAt - startedAt) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

async function renderStatus() {
  const { challenge } = await chrome.storage.local.get("challenge");
  if (!challenge) {
    statusSection.hidden = true;
    return;
  }

  statusSection.hidden = false;
  if (challenge.wonAt) {
    statusText.textContent =
      `Goal reached: ${challenge.startTitle} → ${challenge.goalTitle}\n` +
      `${challenge.steps} steps · ${elapsedText(challenge.startedAt, challenge.wonAt)}`;
    endButton.hidden = true;
  } else if (!challenge.active) {
    statusText.textContent = "Challenge ended.";
    endButton.hidden = true;
  } else {
    statusText.textContent =
      `${challenge.startTitle} → ${challenge.goalTitle}\n` +
      `${challenge.steps} steps · ${elapsedText(challenge.startedAt)}`;
    endButton.hidden = false;
  }
}

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.hidden = false;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorMessage.hidden = true;
  startButton.disabled = true;

  const formData = new FormData(form);
  try {
    const response = await chrome.runtime.sendMessage({
      type: "startChallenge",
      startTitle: formData.get("startTitle"),
      goalTitle: formData.get("goalTitle"),
    });
    if (!response?.ok) {
      showError(response?.error || "Could not start the challenge.");
      return;
    }
    await renderStatus();
  } catch (error) {
    showError(`Could not start the challenge: ${error.message}`);
  } finally {
    startButton.disabled = false;
  }
});

endButton.addEventListener("click", async () => {
  errorMessage.hidden = true;
  endButton.disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({ type: "endChallenge" });
    if (!response?.ok) {
      showError(response?.error || "Could not end the challenge.");
      return;
    }
    await renderStatus();
  } catch (error) {
    showError(`Could not end the challenge: ${error.message}`);
  } finally {
    endButton.disabled = false;
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.challenge) {
    renderStatus();
  }
});

renderStatus();
setInterval(renderStatus, 1000);
