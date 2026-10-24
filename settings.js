'use strict';

const DEFAULT_SETTINGS = Object.freeze({
  impostorCount: 0,
  turnSeconds: 15,
  tasksPerCrew: 3,
  killCooldown: 1,
  textSize: 'normal',
  orbitMotion: true
});
const SETTINGS_OPTIONS = Object.freeze({
  impostorCount: [0, 1, 2, 3, 4],
  turnSeconds: [15, 20, 30, 45, 60],
  tasksPerCrew: [2, 3, 4, 5],
  killCooldown: [0, 1, 2],
  textSize: ['normal', 'large']
});
const SETTINGS_STORAGE_KEY = 'orbit.preferences.v1';
let preferencesPersistent = true;

function normalizePreferences(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const normalized = {};
  for (const [key, fallback] of Object.entries(DEFAULT_SETTINGS)) {
    normalized[key] = key === 'orbitMotion'
      ? typeof source[key] === 'boolean' ? source[key] : fallback
      : SETTINGS_OPTIONS[key].includes(source[key]) ? source[key] : fallback;
  }
  return normalized;
}

function loadPreferences() {
  try {
    return normalizePreferences(JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY)));
  } catch {
    preferencesPersistent = false;
    return { ...DEFAULT_SETTINGS };
  }
}

let preferences = loadPreferences();

function applyPreferences() {
  document.documentElement.style.setProperty('--text-scale', preferences.textSize === 'large' ? '1.12' : '1');
  document.documentElement.dataset.orbit = preferences.orbitMotion ? 'on' : 'off';
}

function savePreferences(value) {
  preferences = normalizePreferences(value);
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(preferences));
    preferencesPersistent = true;
  } catch {
    preferencesPersistent = false;
  }
  applyPreferences();
  return preferencesPersistent;
}

function maxImpostors(playerCount) {
  return Math.max(1, Math.floor((playerCount - 1) / 2));
}

function impostorCountFor(playerCount, requested = preferences.impostorCount) {
  const configured = SETTINGS_OPTIONS.impostorCount.includes(requested) ? requested : 0;
  const desired = configured === 0 ? (playerCount >= 7 ? 2 : 1) : configured;
  return Math.min(desired, maxImpostors(playerCount));
}

function newGameRules(playerCount = 6) {
  return Object.freeze({
    impostorCount: impostorCountFor(playerCount),
    turnSeconds: preferences.turnSeconds,
    tasksPerCrew: preferences.tasksPerCrew,
    killCooldown: preferences.killCooldown
  });
}

applyPreferences();
