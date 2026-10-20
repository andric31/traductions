/* Vocabulaire commun aux viewers et fiches ; moteurs de l'extension F95 v5.1. */
(() => {
  "use strict";
  const allowed = Object.freeze(["Ren'Py", "RPGM", "Unity", "Godot", "Unreal Engine",
    "HTML", "Java", "Flash", "QSP", "WebGL", "RAGS", "Tads", "ADRIFT", "Others", "Wolf RPG"]);
  const aliases = Object.freeze({
    renpy: "Ren'Py", rpgm: "RPGM", rpg: "RPGM", rpgmaker: "RPGM",
    rpgmakerxp: "RPGM", rpgmakermv: "RPGM", rpgmakermz: "RPGM",
    rpgmakervx: "RPGM", rpgmakervxace: "RPGM", rpgmaker2000: "RPGM", rpgmaker2003: "RPGM",
    unity: "Unity", godot: "Godot", godotengine: "Godot",
    unreal: "Unreal Engine", unrealengine: "Unreal Engine", ue4: "Unreal Engine", ue5: "Unreal Engine",
    html: "HTML", html5: "HTML", web: "HTML", java: "Java", flash: "Flash", qsp: "QSP",
    webgl: "WebGL", rags: "RAGS", tads: "Tads", adrift: "ADRIFT",
    others: "Others", other: "Others", wolf: "Wolf RPG", wolfrpg: "Wolf RPG",
    wolfrpgm: "Wolf RPG", wolfrpgmaker: "Wolf RPG"
  });
  const key = value => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const canonicalEngine = value => Object.prototype.hasOwnProperty.call(aliases, key(value)) ? aliases[key(value)] : "";
  const separators = /\s*(?:\/|\||,|;|&|\+|\band\b)\s*/i;
  function engineValues(values) {
    const result = [];
    for (const value of values.flatMap(v => Array.isArray(v) ? v : typeof v === "string" ? [v] : [])) {
      const whole = canonicalEngine(value);
      const engines = whole ? [whole] : String(value).split(separators).map(canonicalEngine);
      for (const engine of engines) if (engine && !result.includes(engine)) result.push(engine);
    }
    return result;
  }
  function enginesFromGame(game, fallback = []) {
    const source = game || {}, nested = source.gameData || {};
    // La fiche d'un enfant de collection est prioritaire sur celle de son parent.
    for (const values of [[nested.engines, nested.engine], [source.engines, source.engine], fallback]) {
      const found = engineValues(values);
      if (found.length) return found;
    }
    return [];
  }
  function classify(value) {
    const engine = canonicalEngine(value), k = key(value);
    if (engine) return { kind: "engines", value: engine };
    if (k === "vn") return { kind: "categories", value: "VN" };
    if (k === "collection") return { kind: "categories", value: "Collection" };
    if (k === "completed") return { kind: "status", value: "Completed" };
    if (k === "abandoned") return { kind: "status", value: "Abandoned" };
    if (k === "onhold") return { kind: "status", value: "Onhold" };
    return null;
  }
  // Lire uniquement les métadonnées en tête, sans découper les noms de jeux.
  const prefixPattern = /^(?:wolf[\s_-]+rpg(?:[\s_-]*maker|m)?|unreal[\s_-]+engine|rpg[\s_-]*maker(?:[\s_-]*(?:vx[\s_-]*ace|xp|mv|mz|vx|2000|2003))?|godot[\s_-]+engine|on[\s_-]+hold|ren[\s_.'’‘ʼ`-]*py|wolfrpg(?:maker|m)?|unrealengine|godotengine|collection|completed|abandoned|onhold|others|other|godot|unity|rpgm|rpg|html5?|flash|webgl|adrift|java|rags|tads|qsp|ue4|ue5|vn)(?=$|[\s/|,&:;\-–—\[({])/i;
  function cleanTitle(raw) {
    const original = String(raw || "").trim();
    let remaining = original, consumed = false;
    const result = { title: original, categories: [], engines: [], status: "En cours" };
    for (let step = 0; step < 64 && remaining; step++) {
      let items = [], length = 0;
      if (/^[\[({]/.test(remaining)) {
        const bracket = remaining.match(/^(?:\[([^\[\]]+)\]|\(([^()]+)\)|\{([^{}]+)\})/);
        if (bracket) {
          const value = bracket[1] || bracket[2] || bracket[3];
          const item = classify(value);
          items = item ? [item] : value.split(separators).map(classify);
          length = bracket[0].length;
        }
      } else {
        const prefix = remaining.match(prefixPattern);
        if (prefix) { items = [classify(prefix[0])]; length = prefix[0].length; }
      }
      if (!items.length || items.some(item => !item)) break;
      for (const item of items) {
        if (item.kind === "status") result.status = item.value;
        else if (!result[item.kind].includes(item.value)) result[item.kind].push(item.value);
      }
      consumed = true;
      remaining = remaining.slice(length).replace(/^[\s/|,&:;\-–—]+/, "");
      if (/^and\s+/i.test(remaining) && prefixPattern.test(remaining.replace(/^and\s+/i, ""))) {
        remaining = remaining.replace(/^and\s+/i, "");
      }
    }
    result.title = consumed ? remaining : original;
    return result;
  }
  globalThis.F95Engines = Object.freeze({ allowed, canonicalEngine, cleanTitle, enginesFromGame });
})();
