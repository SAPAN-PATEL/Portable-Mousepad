// State Management
let ws = null;
let reconnectTimer = null;
let sensitivity = parseFloat(localStorage.getItem('sensitivity')) || 1.5;
let scrollSpeed = parseFloat(localStorage.getItem('scroll-speed')) || 1.0;
let hapticsEnabled = localStorage.getItem('haptics') !== 'false';

// Touch tracking state
let isTouching = false;
let lastTouchX = 0;
let lastTouchY = 0;

// Multi-touch scroll tracking
let isScrolling = false;
let lastScrollX = 0;
let lastScrollY = 0;

// Tap detection
let touchStartTime = 0;
let touchStartX = 0;
let touchStartY = 0;
let lastTapTime = 0;
let tapCount = 0;

// DOM Elements
const touchpad = document.getElementById('touchpad');
const scrollStrip = document.getElementById('scroll-strip');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const btnLeft = document.getElementById('btn-left');
const btnRight = document.getElementById('btn-right');
const hiddenInput = document.getElementById('hidden-input');
const btnTriggerKeyboard = document.getElementById('btn-trigger-keyboard');
const sensitivitySlider = document.getElementById('slider-sensitivity');
const sensitivityValue = document.getElementById('sensitivity-value');
const scrollSpeedSlider = document.getElementById('slider-scroll-speed');
const scrollSpeedValue = document.getElementById('scroll-speed-value');
const toggleHaptics = document.getElementById('toggle-haptics');

// Initialize settings UI
sensitivitySlider.value = sensitivity;
sensitivityValue.textContent = `${sensitivity.toFixed(1)}x`;
scrollSpeedSlider.value = scrollSpeed;
scrollSpeedValue.textContent = `${scrollSpeed.toFixed(1)}x`;
toggleHaptics.checked = hapticsEnabled;

// 1. Navigation Tabs Manager
const tabs = document.querySelectorAll('.tab-btn');
const sections = document.querySelectorAll('.tab-section');

tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        sections.forEach(s => s.classList.remove('active'));
        
        tab.classList.add('active');
        const target = tab.getAttribute('data-target');
        document.getElementById(target).classList.add('active');
        
        triggerHaptic('click');
        
        // Auto focus hidden input if we switch to keyboard tab
        if (target === 'keyboard-section') {
            setTimeout(() => hiddenInput.focus(), 150);
        }
    });
});

// 2. WebSocket Connection manager
function connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    updateStatus('connecting', 'Connecting...');
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        updateStatus('connected', 'Connected');
        if (reconnectTimer) {
            clearInterval(reconnectTimer);
            reconnectTimer = null;
        }
        triggerHaptic('double');
    };
    
    ws.onclose = () => {
        updateStatus('disconnected', 'Disconnected');
        if (!reconnectTimer) {
            reconnectTimer = setInterval(connect, 3000);
        }
    };
    
    ws.onerror = () => {
        updateStatus('disconnected', 'Connection Error');
    };
}

function updateStatus(state, message) {
    statusDot.className = `status-dot ${state}`;
    statusText.textContent = message;
}

function sendCommand(cmd) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(cmd);
    }
}

// 3. Vibration/Haptic helper
function triggerHaptic(type) {
    if (!hapticsEnabled || !navigator.vibrate) return;
    try {
        if (type === 'click') {
            navigator.vibrate(10);
        } else if (type === 'double') {
            navigator.vibrate([10, 30, 10]);
        } else if (type === 'press') {
            navigator.vibrate(15);
        }
    } catch (e) {
        console.warn('Vibration API not supported or allowed.', e);
    }
}

// 4. Touchpad Touch Gestures Logic
touchpad.addEventListener('touchstart', (e) => {
    e.preventDefault();
    touchpad.classList.add('active');
    
    const touches = e.touches;
    
    if (touches.length === 1) {
        // Single finger movement initialization
        isTouching = true;
        isScrolling = false;
        lastTouchX = touches[0].clientX;
        lastTouchY = touches[0].clientY;
        
        // Setup tap detection
        touchStartTime = Date.now();
        touchStartX = touches[0].clientX;
        touchStartY = touches[0].clientY;
    } else if (touches.length === 2) {
        // Two finger scroll initialization
        isTouching = false;
        isScrolling = true;
        lastScrollX = (touches[0].clientX + touches[1].clientX) / 2;
        lastScrollY = (touches[0].clientY + touches[1].clientY) / 2;
        
        touchStartTime = Date.now(); // Track two-finger tap
        touchStartX = lastScrollX;
        touchStartY = lastScrollY;
    }
});

touchpad.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touches = e.touches;
    
    if (isTouching && touches.length === 1) {
        const x = touches[0].clientX;
        const y = touches[0].clientY;
        
        const dx = (x - lastTouchX) * sensitivity;
        const dy = (y - lastTouchY) * sensitivity;
        
        if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
            sendCommand(`m ${dx.toFixed(2)} ${dy.toFixed(2)}`);
        }
        
        lastTouchX = x;
        lastTouchY = y;
    } else if (isScrolling && touches.length === 2) {
        const x = (touches[0].clientX + touches[1].clientX) / 2;
        const y = (touches[0].clientY + touches[1].clientY) / 2;
        
        // Scroll physics (invert for traditional natural scrolling direction)
        const dx = (x - lastScrollX) * scrollSpeed * 1.5;
        const dy = (y - lastScrollY) * scrollSpeed * 1.5;
        
        if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
            sendCommand(`s ${Math.round(dy)} ${Math.round(dx)}`);
        }
        
        lastScrollX = x;
        lastScrollY = y;
    }
});

touchpad.addEventListener('touchend', (e) => {
    e.preventDefault();
    touchpad.classList.remove('active');
    
    const touchDuration = Date.now() - touchStartTime;
    const touches = e.touches;
    
    if (isTouching && touches.length === 0) {
        // Check for single finger tap
        const deltaX = lastTouchX - touchStartX;
        const deltaY = lastTouchY - touchStartY;
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        
        if (touchDuration < 200 && distance < 8) {
            // Tap detected
            const now = Date.now();
            if (now - lastTapTime < 280) {
                // Double tap
                sendCommand('c double');
                triggerHaptic('double');
                lastTapTime = 0;
            } else {
                // Single tap
                sendCommand('c left');
                triggerHaptic('click');
                lastTapTime = now;
            }
        }
        isTouching = false;
    } else if (isScrolling && touches.length < 2) {
        // Check for 2-finger tap (right click)
        const distance = Math.sqrt(
            Math.pow((lastScrollX - touchStartX), 2) + 
            Math.pow((lastScrollY - touchStartY), 2)
        );
        
        if (touchDuration < 200 && distance < 12) {
            sendCommand('c right');
            triggerHaptic('press');
        }
        
        isScrolling = false;
        // If one finger remains, transition back to moving
        if (touches.length === 1) {
            isTouching = true;
            lastTouchX = touches[0].clientX;
            lastTouchY = touches[0].clientY;
        }
    }
});

touchpad.addEventListener('touchcancel', () => {
    touchpad.classList.remove('active');
    isTouching = false;
    isScrolling = false;
});

// 5. Scroll Strip Touch Events
let scrollStripStartY = 0;
scrollStrip.addEventListener('touchstart', (e) => {
    e.preventDefault();
    scrollStrip.classList.add('active');
    scrollStripStartY = e.touches[0].clientY;
    triggerHaptic('click');
});

scrollStrip.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const y = e.touches[0].clientY;
    const dy = (y - scrollStripStartY) * scrollSpeed * 2.0;
    
    if (Math.abs(dy) > 0.5) {
        sendCommand(`s ${Math.round(dy)} 0`);
        scrollStripStartY = y; // reset base
    }
});

scrollStrip.addEventListener('touchend', (e) => {
    e.preventDefault();
    scrollStrip.classList.remove('active');
});

// 6. Click Button Events (Hardware emulation)
const bindHardwareButton = (buttonEl, action) => {
    const press = (e) => {
        e.preventDefault();
        sendCommand(`d ${action}`);
        triggerHaptic('click');
    };
    
    const release = (e) => {
        e.preventDefault();
        sendCommand(`u ${action}`);
    };
    
    buttonEl.addEventListener('touchstart', press);
    buttonEl.addEventListener('touchend', release);
    buttonEl.addEventListener('mousedown', press);
    buttonEl.addEventListener('mouseup', release);
};

bindHardwareButton(btnLeft, 'left');
bindHardwareButton(btnRight, 'right');

// 7. Media Key Controls
const mediaButtons = document.querySelectorAll('.media-btn');
mediaButtons.forEach(btn => {
    const handleMediaClick = (e) => {
        e.preventDefault();
        const action = btn.id.replace('mkey-', '');
        sendCommand(`mkey ${action}`);
        triggerHaptic('press');
    };
    
    btn.addEventListener('touchstart', handleMediaClick);
    btn.addEventListener('click', handleMediaClick);
});

// 8. Keyboard Controls & Invisible Input Hook
btnTriggerKeyboard.addEventListener('click', (e) => {
    e.preventDefault();
    hiddenInput.focus();
    triggerHaptic('click');
});

// Capture keystrokes from mobile soft keyboard
hiddenInput.addEventListener('input', (e) => {
    const val = hiddenInput.value;
    if (val.length > 0) {
        sendCommand(`t ${val}`);
        hiddenInput.value = ''; // Immediately clear
    }
});

hiddenInput.addEventListener('keydown', (e) => {
    // Intercept Backspace, Enter, Space, Tab
    if (e.key === 'Backspace') {
        sendCommand('k 51');
        triggerHaptic('click');
    } else if (e.key === 'Enter') {
        sendCommand('k 36');
        triggerHaptic('click');
    } else if (e.key === 'Tab') {
        sendCommand('k 48');
        triggerHaptic('click');
    } else if (e.key === 'Escape') {
        sendCommand('k 53');
        triggerHaptic('click');
    }
});

// Custom keyboard action buttons (Esc, Tab, Backspace, Enter, Arrows)
const keyButtons = document.querySelectorAll('.key-btn');
keyButtons.forEach(btn => {
    const handleKeyClick = (e) => {
        e.preventDefault();
        const keyCode = btn.getAttribute('data-keycode');
        if (keyCode) {
            sendCommand(`k ${keyCode}`);
            triggerHaptic('click');
        }
    };
    btn.addEventListener('touchstart', handleKeyClick);
    btn.addEventListener('click', handleKeyClick);
});

// 9. Settings Pane Events
sensitivitySlider.addEventListener('input', (e) => {
    sensitivity = parseFloat(e.target.value);
    sensitivityValue.textContent = `${sensitivity.toFixed(1)}x`;
    localStorage.setItem('sensitivity', sensitivity);
});

scrollSpeedSlider.addEventListener('input', (e) => {
    scrollSpeed = parseFloat(e.target.value);
    scrollSpeedValue.textContent = `${scrollSpeed.toFixed(1)}x`;
    localStorage.setItem('scroll-speed', scrollSpeed);
});

toggleHaptics.addEventListener('change', (e) => {
    hapticsEnabled = e.target.checked;
    localStorage.setItem('haptics', hapticsEnabled);
    if (hapticsEnabled) {
        triggerHaptic('double');
    }
});

// Connect WebSocket on Load!
connect();
