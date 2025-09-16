
(function () {
  // Height & Width of current window, use for calculating random postion of word.
  var viewport = { w: window.innerWidth, h: window.innerHeight };

  // wordbank
  var wordBank = [
    'wordk','dream','family','mind','house','note','plan','hope','wish','draft',
    'travel','sense','assignment','internship','job','focus','marrige','relationship','sign','friends',
    'argument','path','guide','future','country','state','mood','form','tone','pulse',
    'light','sound','voice','touch','space','time','heartbeat','anxiety','happy','map',
    'story','sad','emotion','gym','tuition','fame','view','money','tomorrow','yesterday'
  ];

  // max world to avoid lag.
  var maxWords = 200;

  // containner
  var container = document.body;

  // random number between min and max
  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }

  // random number from arr.
  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // creat world.
  function createWord() {
    // span element.
    var el = document.createElement('span');
    el.className = 'word';
    el.textContent = pick(wordBank);

    // random font size
    var fontSize = Math.round(rand(16, 64));
    el.style.fontSize = fontSize + 'px';

    // put element out side the scrren and import to the page to caculate it's height and width curractly.
    el.style.left = '-9999px';
    el.style.top = '-9999px';
    container.appendChild(el);

    // get element's height and width
    var rect = el.getBoundingClientRect();
    var maxX = viewport.w - rect.width;
    var maxY = viewport.h - rect.height;
    if (maxX < 0) { maxX = 0; }
    if (maxY < 0) { maxY = 0; }

    // random position inside the screen.
    var x = Math.round(rand(0, maxX));
    var y = Math.round(rand(0, maxY));
    el.style.left = x + 'px';
    el.style.top = y + 'px';

    // shrinking animation when mouse move in.
    var shrinking = false; // prevent repeated triger.
    function shrink() {
      if (shrinking) { return; }
      shrinking = true;
      el.classList.add('shrinking'); // add class name, trigger animation in CSS.
      el.style.pointerEvents = 'none'; // prevent repeated triger.
    }
    el.addEventListener('mouseenter', shrink);
    el.addEventListener('touchstart', shrink, { passive: true });

    // Eventlistenner, remove element from DOM after animation.
    el.addEventListener('transitionend', function (e) {
      // remove after "transform" or "opacity" animation
      if (shrinking && (e.propertyName === 'transform' || e.propertyName === 'opacity')) {
        if (el.parentNode) {
          el.parentNode.removeChild(el); 
        }
      }
    });

    // make words under the maxwords limit.
    var wordsNow = document.querySelectorAll('.word');
    if (wordsNow.length > maxWords) {
      var excess = wordsNow.length - maxWords;
      for (var i = 0; i < excess; i++) {
        if (wordsNow[i] && wordsNow[i].parentNode) {
          wordsNow[i].parentNode.removeChild(wordsNow[i]);
        }
      }
    }
  }

  // loop, gennerate new word randomly.
  function spawnLoop() {
    // delay between (150ms,600ms)
    var delay = Math.round(rand(150, 600));
    setTimeout(function () {
      createWord();   
      spawnLoop();    
    }, delay);
  }

  // update viewport when windows size changed, keep words inside the window.
  window.addEventListener('resize', function () {
    viewport.w = window.innerWidth;
    viewport.h = window.innerHeight;
  });

  // Optional: if page has canvas("myCanvas"), make it fit the screen.
  var canvas = document.getElementById('myCanvas');
  if (canvas) {
    function sizeCanvas() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    sizeCanvas();
    window.addEventListener('resize', sizeCanvas);
  }

  // Start
  spawnLoop();
})();
