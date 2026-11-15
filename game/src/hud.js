// The HUD: reads state and writes DOM, nothing else. Every element it touches is one the
// page already has, so a missing node is a bug the first frame catches rather than a silent
// failure later.
const $ = (id) => document.getElementById(id);

export function createHud() {
  const nodes = {
    crosshair: $('crosshair'),
    hurt: $('hurt'),
    allyScore: $('ally-score'),
    enemyScore: $('enemy-score'),
    clock: $('clock'),
    roundNo: $('round-no'),
    feed: $('feed'),
    health: $('health'),
    credits: $('credits'),
    alive: $('alive'),
    weaponName: $('weapon-name'),
    ammo: $('ammo'),
    ammoMag: $('ammo-mag'),
    ammoReserve: $('ammo-reserve'),
    buy: $('buy'),
    buyTitle: $('buy-title'),
    guns: $('guns'),
    overlay: $('overlay'),
    overlayTitle: $('overlay-title'),
    overlayCopy: $('overlay-copy'),
    play: $('play'),
  };

  let hurtTimer = 0;

  function setScore(ally, enemy, round) {
    nodes.allyScore.textContent = String(ally);
    nodes.enemyScore.textContent = String(enemy);
    nodes.roundNo.textContent = `R${round}`;
  }

  function setClock(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    nodes.clock.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function setHealth(value) {
    nodes.health.textContent = String(Math.max(0, Math.round(value)));
    nodes.health.classList.toggle('low', value <= 35);
  }

  function setCredits(value) {
    nodes.credits.textContent = `$${Math.round(value)}`;
  }

  function setAlive(count) {
    nodes.alive.textContent = count === 1 ? '1 enemy' : `${count} enemies`;
  }

  function setAmmo(mag, reserve, weaponName) {
    nodes.ammoMag.textContent = String(mag);
    nodes.ammoReserve.textContent = String(reserve);
    nodes.ammo.classList.toggle('empty', mag === 0);
    if (weaponName) nodes.weaponName.textContent = weaponName;
  }

  function setSpread(spread) {
    nodes.crosshair.classList.toggle('wide', spread > 0.012);
  }

  function hitMarker() {
    nodes.crosshair.classList.add('hit');
    setTimeout(() => nodes.crosshair.classList.remove('hit'), 90);
  }

  function flashHurt() {
    nodes.hurt.classList.add('on');
    hurtTimer = 0.16;
  }

  function step(dt) {
    if (hurtTimer > 0) {
      hurtTimer -= dt;
      if (hurtTimer <= 0) nodes.hurt.classList.remove('on');
    }
  }

  function addFeed(killer, victim, headshot) {
    const row = document.createElement('div');
    row.innerHTML = `<b>${killer}</b> → ${victim}${headshot ? ' ✦' : ''}`;
    nodes.feed.append(row);
    setTimeout(() => row.remove(), 3400);
  }

  function showBuy(weapons, credits, onPick) {
    nodes.buyTitle.textContent = `Buy phase — $${Math.round(credits)}`;
    nodes.guns.replaceChildren();
    weapons.forEach((weapon, index) => {
      const affordable = credits >= weapon.cost;
      const button = document.createElement('button');
      button.className = 'gun';
      button.type = 'button';
      button.disabled = !affordable;
      button.innerHTML =
        `<span class="n">${index + 1}. ${weapon.name}</span>` +
        `<span class="stat">${weapon.damage.torso} dmg · ${weapon.magSize} rnd</span>` +
        `<span class="cost">${weapon.cost === 0 ? 'free' : '$' + weapon.cost}</span>`;
      button.addEventListener('click', () => onPick(weapon));
      nodes.guns.append(button);
    });
    nodes.buy.hidden = false;
  }

  function hideBuy() {
    nodes.buy.hidden = true;
  }

  function showOverlay(title, copy, buttonText) {
    nodes.overlayTitle.textContent = title;
    nodes.overlayCopy.textContent = copy;
    nodes.play.textContent = buttonText;
    nodes.overlay.hidden = false;
  }

  function hideOverlay() {
    nodes.overlay.hidden = true;
  }

  function onPlay(handler) {
    nodes.play.addEventListener('click', handler);
  }

  return {
    step, setScore, setClock, setHealth, setCredits, setAlive, setAmmo, setSpread,
    hitMarker, flashHurt, addFeed, showBuy, hideBuy, showOverlay, hideOverlay, onPlay,
  };
}
