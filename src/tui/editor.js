/**
 * Simple Terminal Text Editor
 * 
 * A simplified text editor for the terminal, inspired by nano and vim.
 */

const blessed = require('blessed');
const fs = require('fs').promises;
const path = require('path');
const { logger } = require('../utils/logger');

/**
 * Create a simple terminal text editor
 * 
 * @param {Object} options Editor options
 * @param {string} options.filePath Optional file to open
 * @param {string} options.theme Editor theme
 * @returns {Promise<void>} Promise that resolves when editor is closed
 */
async function createSimpleEditor({ filePath = null, theme = 'dark' }) {
  // Create screen
  const screen = blessed.screen({
    smartCSR: true,
    title: filePath ? `FrankCode Editor - ${filePath}` : 'FrankCode Editor',
    fullUnicode: true,
    dockBorders: true,
    autoPadding: true,
    sendFocus: true,
    cursor: {
      artificial: true,
      shape: 'block',
      blink: true,
      color: 'blue'
    },
    debug: false
  });

  // Apply theme
  const themes = {
    dark: {
      bg: 'black',
      fg: 'white',
      border: 'blue',
      focus: {
        bg: 'black',
        fg: 'white',
        border: 'green'
      },
      status: {
        bg: 'blue',
        fg: 'white'
      }
    },
    light: {
      bg: 'white',
      fg: 'black',
      border: 'blue',
      focus: {
        bg: 'white',
        fg: 'black',
        border: 'green'
      },
      status: {
        bg: 'blue',
        fg: 'white'
      }
    }
  };

  const currentTheme = themes[theme] || themes.dark;

  // Create the editor component
  const editor = blessed.textarea({
    parent: screen,
    top: 0,
    left: 0,
    height: '100%-2',
    width: '100%',
    border: {
      type: 'line',
      fg: currentTheme.border
    },
    style: {
      bg: currentTheme.bg,
      fg: currentTheme.fg,
      focus: {
        border: {
          fg: currentTheme.focus.border
        }
      }
    },
    keys: true,
    vi: true,
    mouse: true,
    scrollable: true,
    alwaysScroll: true,
    scrollbar: {
      ch: ' ',
      style: {
        bg: 'blue'
      },
      track: {
        bg: 'black'
      }
    },
    padding: 1,
    label: filePath ? ` ${path.basename(filePath)} ` : ' New File '
  });

  // Create status bar with enhanced commands
  const statusBar = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    width: '100%',
    height: 1,
    style: {
      bg: currentTheme.status.bg,
      fg: currentTheme.status.fg
    },
    content: ' Ctrl+S: Save | Ctrl+Q: Quit | Ctrl+F: Find | Ctrl+G: Goto | Ctrl+X: Cut | Ctrl+C: Copy | Ctrl+V: Paste | Shift+Arrows: Select'
  });

  // Create status message (for temporary messages)
  const statusMessage = blessed.box({
    parent: screen,
    bottom: 1,
    left: 0,
    width: '100%',
    height: 1,
    style: {
      bg: currentTheme.bg,
      fg: 'yellow'
    },
    hidden: true
  });

  // Show a status message for a short time
  function showMessage(message, duration = 3000) {
    statusMessage.setContent(` ${message}`);
    statusMessage.show();
    screen.render();
    
    setTimeout(() => {
      statusMessage.hide();
      screen.render();
    }, duration);
  }

  // Load file if provided
  if (filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      editor.setValue(content);
      showMessage(`Loaded ${filePath}`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        showMessage(`New file: ${filePath}`);
      } else {
        showMessage(`Error loading file: ${error.message}`);
      }
    }
  }

  // Save current content to a file
  async function saveFile(savePath) {
    try {
      const content = editor.getValue();
      await fs.writeFile(savePath, content, 'utf8');
      editor.label = ` ${path.basename(savePath)} `;
      showMessage(`Saved to ${savePath}`);
      return true;
    } catch (error) {
      showMessage(`Error saving file: ${error.message}`);
      return false;
    }
  }

  // Prompt for a filename
  function promptFilename(callback) {
    const prompt = blessed.question({
      parent: screen,
      border: 'line',
      height: 3,
      width: '50%',
      top: 'center',
      left: 'center',
      label: ' Save As ',
      tags: true,
      keys: true,
      vi: true,
      mouse: true
    });

    prompt.ask('Enter filename to save:', async (err, value) => {
      if (err || !value) {
        return;
      }

      const savePath = path.isAbsolute(value) ? value : path.join(process.cwd(), value);
      await callback(savePath);
    });
  }

  // Prompt for text to find
  function promptFind() {
    const prompt = blessed.question({
      parent: screen,
      border: 'line',
      height: 3,
      width: '50%',
      top: 'center',
      left: 'center',
      label: ' Find Text ',
      tags: true,
      keys: true,
      vi: true,
      mouse: true
    });

    prompt.ask('Enter text to find:', async (err, value) => {
      if (err || !value) {
        return;
      }

      findText(value);
    });
  }

  // Find text in the editor
  function findText(text) {
    const content = editor.getValue();
    const index = content.indexOf(text);
    
    if (index === -1) {
      showMessage(`No matches found for: ${text}`);
      return;
    }

    // Count lines to position cursor correctly
    const lines = content.substring(0, index).split('\n');
    const line = lines.length - 1;
    const col = lines[lines.length - 1].length;
    
    // Not ideal but works as fallback
    editor.select(index, index + text.length);
    showMessage(`Found match at position ${index}`);
  }

  // Prompt for a line number
  function promptGotoLine() {
    const prompt = blessed.question({
      parent: screen,
      border: 'line',
      height: 3,
      width: '50%',
      top: 'center',
      left: 'center',
      label: ' Go To Line ',
      tags: true,
      keys: true,
      vi: true,
      mouse: true
    });

    prompt.ask('Enter line number:', async (err, value) => {
      if (err || !value) {
        return;
      }

      const lineNum = parseInt(value, 10);
      if (isNaN(lineNum) || lineNum < 1) {
        showMessage('Invalid line number');
        return;
      }

      gotoLine(lineNum);
    });
  }

  // Go to specific line
  function gotoLine(lineNum) {
    const content = editor.getValue();
    const lines = content.split('\n');
    
    if (lineNum > lines.length) {
      showMessage(`File has only ${lines.length} lines`);
      return;
    }

    // Calculate position of the line
    let pos = 0;
    for (let i = 0; i < lineNum - 1; i++) {
      pos += lines[i].length + 1; // +1 for newline
    }

    // Set cursor position (using select as a workaround)
    editor.select(pos, pos);
    showMessage(`Moved to line ${lineNum}`);
  }

  // Track selection state
  let selectionMode = false;
  let selectionStart = null;
  let selectionEnd = null;
  let clipboard = '';

  // Helper to get cursor position
  function getCursorPosition() {
    // This is a workaround since blessed doesn't expose cursor position directly
    const content = editor.getValue();
    const cursor = editor._caret || { _x: 0, _y: 0 };
    return { x: cursor._x, y: cursor._y };
  }

  // Start selection at current cursor position
  function startSelection() {
    selectionMode = true;
    const cursorPos = getCursorPosition();
    selectionStart = { x: cursorPos.x, y: cursorPos.y };
    showMessage('Selection started', 1000);
  }

  // End selection at current cursor position
  function endSelection() {
    if (!selectionMode) return;
    selectionMode = false;
    const cursorPos = getCursorPosition();
    selectionEnd = { x: cursorPos.x, y: cursorPos.y };
    
    // Highlight the selection
    const content = editor.getValue();
    const lines = content.split('\n');
    
    // Calculate selected text (basic implementation)
    if (selectionStart && selectionEnd) {
      // Get selected text (simple version)
      try {
        const startIdx = editor.getOffsetCoords(selectionStart);
        const endIdx = editor.getOffsetCoords(selectionEnd);
        
        // Show selection info
        showMessage(`Selection: ${startIdx} to ${endIdx}`, 1000);
      } catch (e) {
        showMessage('Selection completed', 1000);
      }
    }
  }

  // Cut selected text
  function cutSelection() {
    if (!editor.hasSelection()) {
      showMessage('No text selected');
      return;
    }
    
    // Get selected text
    const selected = editor.getSelectedText();
    if (selected) {
      clipboard = selected;
      editor.deleteSelection();
      showMessage(`Cut ${selected.length} characters`);
    }
  }

  // Copy selected text
  function copySelection() {
    if (!editor.hasSelection()) {
      showMessage('No text selected');
      return;
    }
    
    // Get selected text
    const selected = editor.getSelectedText();
    if (selected) {
      clipboard = selected;
      showMessage(`Copied ${selected.length} characters`);
    }
  }

  // Paste from clipboard
  function pasteText() {
    if (!clipboard) {
      showMessage('Clipboard is empty');
      return;
    }
    
    // Insert clipboard text at cursor position
    editor.insertText(clipboard);
    showMessage(`Pasted ${clipboard.length} characters`);
  }

  // Set key bindings
  editor.key(['C-s'], () => {
    if (filePath) {
      saveFile(filePath);
    } else {
      promptFilename(saveFile);
    }
  });

  editor.key(['C-q'], () => {
    // Show confirmation if file has changes
    const prompt = blessed.question({
      parent: screen,
      border: 'line',
      height: 3,
      width: '50%',
      top: 'center',
      left: 'center',
      label: ' Quit ',
      tags: true,
      keys: true,
      vi: true,
      mouse: true
    });

    prompt.ask('Save changes before quitting? (y/n)', async (err, value) => {
      if (err) return;
      
      if (value && (value.toLowerCase() === 'y' || value.toLowerCase() === 'yes')) {
        if (filePath) {
          await saveFile(filePath);
        } else {
          promptFilename(async (savePath) => {
            await saveFile(savePath);
            screen.destroy();
            process.exit(0);
          });
          return;
        }
      }
      
      screen.destroy();
      process.exit(0);
    });
  });

  editor.key(['C-f'], () => {
    promptFind();
  });

  editor.key(['C-g'], () => {
    promptGotoLine();
  });
  
  // Add cut, copy, paste
  editor.key(['C-x'], () => {
    cutSelection();
  });
  
  editor.key(['C-c'], () => {
    copySelection();
  });
  
  editor.key(['C-v'], () => {
    pasteText();
  });
  
  // Add shift+arrow for selection
  editor.key(['S-up'], () => {
    if (!selectionMode) startSelection();
    editor.up();
    screen.render();
  });
  
  editor.key(['S-down'], () => {
    if (!selectionMode) startSelection();
    editor.down();
    screen.render();
  });
  
  editor.key(['S-left'], () => {
    if (!selectionMode) startSelection();
    editor.left();
    screen.render();
  });
  
  editor.key(['S-right'], () => {
    if (!selectionMode) startSelection();
    editor.right();
    screen.render();
  });
  
  // End selection when releasing shift
  editor.key(['up', 'down', 'left', 'right'], () => {
    if (selectionMode) endSelection();
  });

  // Override arrow key behavior for proper cursor movement
  editor.key(['up'], () => {
    // Move cursor up one line
    editor._listener.emit('keypress', '', { name: 'up' });
    screen.render();
  });

  editor.key(['down'], () => {
    // Move cursor down one line
    editor._listener.emit('keypress', '', { name: 'down' });
    screen.render();
  });

  editor.key(['left'], () => {
    // Move cursor left one character
    editor._listener.emit('keypress', '', { name: 'left' });
    screen.render();
  });

  editor.key(['right'], () => {
    // Move cursor right one character
    editor._listener.emit('keypress', '', { name: 'right' });
    screen.render();
  });

  editor.key(['pageup'], () => {
    // Move cursor up multiple lines
    for (let i = 0; i < Math.max(1, editor.height / 2); i++) {
      editor._listener.emit('keypress', '', { name: 'up' });
    }
    screen.render();
  });

  editor.key(['pagedown'], () => {
    // Move cursor down multiple lines
    for (let i = 0; i < Math.max(1, editor.height / 2); i++) {
      editor._listener.emit('keypress', '', { name: 'down' });
    }
    screen.render();
  });
  
  // Add home and end keys
  editor.key(['home'], () => {
    // Move cursor to beginning of line
    editor._listener.emit('keypress', '', { name: 'home' });
    screen.render();
  });
  
  editor.key(['end'], () => {
    // Move cursor to end of line
    editor._listener.emit('keypress', '', { name: 'end' });
    screen.render();
  });

  // Mouse wheel events for scrolling
  editor.on('wheelup', () => {
    editor.scroll(-1);
    screen.render();
  });

  editor.on('wheeldown', () => {
    editor.scroll(1);
    screen.render();
  });

  // Use Escape key to exit 
  screen.key(['escape'], () => {
    const prompt = blessed.question({
      parent: screen,
      border: 'line',
      height: 3,
      width: '50%',
      top: 'center',
      left: 'center',
      label: ' Exit ',
      tags: true,
      keys: true,
      vi: true,
      mouse: true
    });

    prompt.ask('Exit editor? (y/n)', (err, value) => {
      if (err) return;
      
      if (value && (value.toLowerCase() === 'y' || value.toLowerCase() === 'yes')) {
        screen.destroy();
        process.exit(0);
      }
    });
  });

  // Focus the editor
  editor.focus();

  // Render the screen
  screen.render();

  // Return a promise that never resolves (until process exit)
  return new Promise(() => {});
}

module.exports = {
  createSimpleEditor
};