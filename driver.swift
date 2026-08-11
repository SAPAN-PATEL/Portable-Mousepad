import Foundation
import Cocoa
import ApplicationServices

// Set up event source
let eventSource = CGEventSource(stateID: .combinedSessionState)

func getMousePosition() -> CGPoint {
    let event = CGEvent(source: nil)
    return event?.location ?? .zero
}

func moveMouse(dx: CGFloat, dy: CGFloat) {
    let current = getMousePosition()
    let newPos = CGPoint(x: current.x + dx, y: current.y + dy)
    let event = CGEvent(mouseEventSource: eventSource, mouseType: .mouseMoved, mouseCursorPosition: newPos, mouseButton: .left)
    event?.post(tap: .cghidEventTap)
}

func clickMouse(button: CGMouseButton, clickCount: Int64 = 1) {
    let current = getMousePosition()
    let downType: CGEventType = button == .left ? .leftMouseDown : (button == .right ? .rightMouseDown : .otherMouseDown)
    let upType: CGEventType = button == .left ? .leftMouseUp : (button == .right ? .rightMouseUp : .otherMouseUp)
    
    guard let downEvent = CGEvent(mouseEventSource: eventSource, mouseType: downType, mouseCursorPosition: current, mouseButton: button) else { return }
    downEvent.setIntegerValueField(.mouseEventClickState, value: clickCount)
    downEvent.post(tap: .cghidEventTap)
    
    guard let upEvent = CGEvent(mouseEventSource: eventSource, mouseType: upType, mouseCursorPosition: current, mouseButton: button) else { return }
    upEvent.setIntegerValueField(.mouseEventClickState, value: clickCount)
    upEvent.post(tap: .cghidEventTap)
}

func mouseDown(button: CGMouseButton) {
    let current = getMousePosition()
    let downType: CGEventType = button == .left ? .leftMouseDown : (button == .right ? .rightMouseDown : .otherMouseDown)
    let event = CGEvent(mouseEventSource: eventSource, mouseType: downType, mouseCursorPosition: current, mouseButton: button)
    event?.post(tap: .cghidEventTap)
}

func mouseUp(button: CGMouseButton) {
    let current = getMousePosition()
    let upType: CGEventType = button == .left ? .leftMouseUp : (button == .right ? .rightMouseUp : .otherMouseUp)
    let event = CGEvent(mouseEventSource: eventSource, mouseType: upType, mouseCursorPosition: current, mouseButton: button)
    event?.post(tap: .cghidEventTap)
}

func scroll(dy: Int32, dx: Int32) {
    let event = CGEvent(scrollWheelEvent2Source: eventSource, units: .pixel, wheelCount: 2, wheel1: dy, wheel2: dx, wheel3: 0)
    event?.post(tap: .cghidEventTap)
}

func postUnicodeString(_ text: String) {
    for char in text {
        let utf16 = Array(String(char).utf16)
        guard let downEvent = CGEvent(keyboardEventSource: eventSource, virtualKey: 0, keyDown: true) else { continue }
        downEvent.keyboardSetUnicodeString(stringLength: utf16.count, unicodeString: utf16)
        downEvent.post(tap: .cghidEventTap)
        
        guard let upEvent = CGEvent(keyboardEventSource: eventSource, virtualKey: 0, keyDown: false) else { continue }
        upEvent.keyboardSetUnicodeString(stringLength: utf16.count, unicodeString: utf16)
        upEvent.post(tap: .cghidEventTap)
    }
}

func postKey(code: CGKeyCode, flags: CGEventFlags = []) {
    let keyDown = CGEvent(keyboardEventSource: eventSource, virtualKey: code, keyDown: true)
    let keyUp = CGEvent(keyboardEventSource: eventSource, virtualKey: code, keyDown: false)
    if !flags.isEmpty {
        keyDown?.flags = flags
        keyUp?.flags = flags
    }
    keyDown?.post(tap: .cghidEventTap)
    keyUp?.post(tap: .cghidEventTap)
}

func sendMediaKey(_ keyCode: Int32) {
    let flagsDown = NSEvent.ModifierFlags(rawValue: 0xa00)
    let flagsUp = NSEvent.ModifierFlags(rawValue: 0xb00)
    
    let data1Down = Int((keyCode << 16) | 0xa00)
    let evDown = NSEvent.otherEvent(with: .systemDefined,
                                    location: NSPoint(x: 0, y: 0),
                                    modifierFlags: flagsDown,
                                    timestamp: 0,
                                    windowNumber: 0,
                                    context: nil,
                                    subtype: 8,
                                    data1: data1Down,
                                    data2: -1)
    
    let data1Up = Int((keyCode << 16) | 0xb00)
    let evUp = NSEvent.otherEvent(with: .systemDefined,
                                  location: NSPoint(x: 0, y: 0),
                                  modifierFlags: flagsUp,
                                  timestamp: 0,
                                  windowNumber: 0,
                                  context: nil,
                                  subtype: 8,
                                  data1: data1Up,
                                  data2: -1)
    
    evDown?.cgEvent?.post(tap: .cghidEventTap)
    evUp?.cgEvent?.post(tap: .cghidEventTap)
}

print("driver started. listening to stdin...")
fflush(stdout)

while let line = readLine() {
    let parts = line.trimmingCharacters(in: .whitespacesAndNewlines).components(separatedBy: " ")
    if parts.isEmpty || parts[0].isEmpty { continue }
    
    let command = parts[0]
    switch command {
    case "m": // Relative move: m dx dy
        if parts.count >= 3, let dx = Double(parts[1]), let dy = Double(parts[2]) {
            moveMouse(dx: CGFloat(dx), dy: CGFloat(dy))
        }
    case "c": // Click: c left|right|double
        if parts.count >= 2 {
            let button = parts[1]
            if button == "left" {
                clickMouse(button: .left)
            } else if button == "right" {
                clickMouse(button: .right)
            } else if button == "double" {
                clickMouse(button: .left, clickCount: 2)
            }
        }
    case "d": // Mouse down: d left|right
        if parts.count >= 2 {
            let button = parts[1]
            if button == "left" {
                mouseDown(button: .left)
            } else if button == "right" {
                mouseDown(button: .right)
            }
        }
    case "u": // Mouse up: u left|right
        if parts.count >= 2 {
            let button = parts[1]
            if button == "left" {
                mouseUp(button: .left)
            } else if button == "right" {
                mouseUp(button: .right)
            }
        }
    case "s": // Scroll: s dy dx
        if parts.count >= 3, let dy = Int32(parts[1]), let dx = Int32(parts[2]) {
            scroll(dy: dy, dx: dx)
        }
    case "t": // Type text: t <text>
        if parts.count >= 2 {
            let text = parts.suffix(from: 1).joined(separator: " ")
            postUnicodeString(text)
        }
    case "k": // Key press: k <keycode>
        if parts.count >= 2, let keyCodeVal = UInt16(parts[1]) {
            postKey(code: keyCodeVal)
        }
    case "mkey": // Media key: mkey <play_pause|volume_up|volume_down|mute|next|prev>
        if parts.count >= 2 {
            let action = parts[1]
            switch action {
            case "play_pause":
                sendMediaKey(16)
            case "next":
                sendMediaKey(17)
            case "prev":
                sendMediaKey(18)
            case "volume_up":
                sendMediaKey(0)
            case "volume_down":
                sendMediaKey(1)
            case "mute":
                sendMediaKey(7)
            default:
                break
            }
        }
    default:
        break
    }
}
