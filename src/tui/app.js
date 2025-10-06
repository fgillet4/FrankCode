/**
 * Main Terminal UI Application
 * 
 * Creates and manages the terminal interface using blessed/blessed-contrib
 */

const blessed = require('blessed');
const contrib = require('blessed-contrib');
const { applyTheme } = require('./themes');
const { createInputHandler } = require('./input');
const { createOutputRenderer } = require('./output');
const { createStatusBar } = require('./statusBar');
const { createFileTree } = require('./fileTree');
const { logger } = require('../utils');
const { createAgentCommandProcessor } = require('../agent/agentUtils');

/**
 * Create the TUI application
 * 
 * @param {Object} options Configuration options
 * @param {Object} options.agent The agent instance
 * @param {Object} options.apiClient The API client
 * @param {Object} options.tokenMonitor Token monitoring utility
 * @param {Object} options.config UI configuration
 * @param {string} options.projectRoot Project root directory
 * @returns {Object} The TUI application object
 */
function createApp({ agent, apiClient, tokenMonitor, config, projectRoot, editorMode = false }) {
  // Create screen object
  const screen = blessed.screen({
    smartCSR: true,
    title: 'FrankCode',
    fullUnicode: true,
    dockBorders: true,
    autoPadding: true,
    sendFocus: true,
    mouseEnabled: true,
    useMouse: true,
    // Better mouse settings for selection
    grabMouse: true, 
    forceUnicode: true,
    // Terminal capabilities for better mouse reporting
    terminal: '256color',
    // Allow faster mouse refresh
    fastCSR: true,
    // Additional rendering options
    cursor: {
      artificial: true,
      shape: 'block',
      blink: true,
      color: 'blue'
    }
  });

  // Add global copy/paste handler
screen.key(['C-S-c'], () => {
  const focused = screen.focused;
  if (focused && focused.getContent) {
    const content = focused.getContent();
    try {
      require('child_process').spawn('clip').stdin.end(content);
      if (outputRenderer) {
        outputRenderer.addSystemMessage('Content copied to clipboard');
      }
    } catch (error) {
      if (outputRenderer) {
        outputRenderer.addErrorMessage('Failed to copy to clipboard');
      }
    }
  }
});

// Handle global mouse wheel events more smoothly
screen.on('wheeldown', () => {
  const focused = screen.focused;
  if (focused && focused.scroll) {
    focused.scroll(5);
    screen.render();
  }
});

screen.on('wheelup', () => {
  const focused = screen.focused;
  if (focused && focused.scroll) {
    focused.scroll(-5);
    screen.render();
  }
});

// Add a smoother rendering interval
const renderInterval = setInterval(() => {
  if (screen.lockKeys) return; // Don't render during key processing
  screen.render();
}, 50); // More frequent updates for smoother experience

// Clean up when done
screen.key(['C-c'], () => {
  clearInterval(renderInterval);
  screen.destroy();
  process.exit(0);
});

  // Store config and project root in screen for access by components
  screen.config = config;
  screen.cwd = projectRoot;
  
  // Apply theme
  applyTheme(screen, config.theme);
  
  // Create layout grid
  const grid = new contrib.grid({ rows: 12, cols: 12, screen });
  
  // Create file tree panel (left side, 2/12 of width)
  const fileTreePanel = grid.set(0, 0, 10, 2, contrib.tree, {
    label: 'Project Files',
    style: {
      selected: {
        fg: 'white',
        bg: 'blue'
      }
    },
    template: {
      lines: true
    },
    tags: true
  });
  
  // Create conversation panel (right side, 10/12 of width) - smaller in editor mode
  const conversationPanel = grid.set(0, 2, editorMode ? 4 : 8, 10, blessed.log, {
    label: 'Conversation',
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
    // Improve scrolling experience
    mouse: true,
    keys: true,
    vi: false,  // Turn off vi mode for better mouse interactions
    inputOnFocus: false,
    // Use larger scroll amount for faster navigation
    scrollAmount: 5,
    // Use faster scroll animation
    scrollSpeed: 50,
    // Enable selection and copying
    clickable: true,
    copyMode: true,
    tags: true,
    // Set border color for better visibility
    border: {
      type: 'line',
      fg: 'blue'
    },
    // Better padding for content
    padding: {
      left: 1,
      right: 1
    },
    // For better mouse-based text selection
    grabKeys: true,
    mouseDrag: true
  });
  
  // Add additional key bindings for scrolling
  conversationPanel.key(['pageup'], () => {
    conversationPanel.setScroll(conversationPanel.getScroll() - conversationPanel.height + 2);
    screen.render();
  });
  
  conversationPanel.key(['pagedown'], () => {
    conversationPanel.setScroll(conversationPanel.getScroll() + conversationPanel.height - 2);
    screen.render();
  });
  
  // Allow using up/down arrow keys to scroll when focus is on conversation panel
  conversationPanel.key(['up'], () => {
    conversationPanel.scroll(-3); // Scroll up 3 lines
    screen.render();
  });
  
  conversationPanel.key(['down'], () => {
    conversationPanel.scroll(3); // Scroll down 3 lines
    screen.render();
  });
  // Add mouse handlers for better wheel behavior
conversationPanel.on('wheeldown', () => {
  conversationPanel.scroll(5); // Scroll down 5 lines
  screen.render();
});

conversationPanel.on('wheelup', () => {
  conversationPanel.scroll(-5); // Scroll up 5 lines
  screen.render();
});

conversationPanel.key(['C-c'], () => {
  if (conversationPanel.selected) {
    const selection = conversationPanel.getContent().substring(
      conversationPanel.selected.start,
      conversationPanel.selected.end
    );
    require('child_process').spawn('clip').stdin.end(selection);
    outputRenderer.addSystemMessage('Text copied to clipboard');
  }
});

// Allow selection with mouse
conversationPanel.on('mousedown', (data) => {
  conversationPanel.focus();
  conversationPanel.grabMouse = true;
  conversationPanel.startSelection = { x: data.x, y: data.y };
  screen.render();
});

conversationPanel.on('mouseup', () => {
  conversationPanel.grabMouse = false;
  screen.render();
});

// Use Alt+Up/Down for faster scrolling
conversationPanel.key(['a-up'], () => {
  conversationPanel.scroll(-conversationPanel.height / 2);
  screen.render();
});
conversationPanel.key(['a-down'], () => {
  conversationPanel.scroll(conversationPanel.height / 2);
  screen.render();
});
  // Create input box with different size based on mode
  let inputBox;
  
  if (editorMode) {
    // In editor mode, use a much larger text area (6 rows instead of 2)
    inputBox = grid.set(4, 2, 6, 10, blessed.textarea, {
      label: 'Text Editor',
      inputOnFocus: true,
      padding: {
        top: 1,
        left: 2
      },
      style: {
        fg: 'white',
        bg: 'black',
        focus: {
          fg: 'white',
          bg: 'black',
          border: {
            fg: 'blue'
          }
        }
      },
      border: {
        type: 'line'
      },
      // Better for text editing
      keys: true,
      vi: true,
      mouse: true
    });
  } else {
    // Regular command input box
    inputBox = grid.set(8, 2, 2, 10, blessed.textarea, {
      label: 'Command',
      inputOnFocus: true,
      padding: {
        top: 1,
        left: 2
      },
      style: {
        fg: 'white',
        bg: 'black',
        focus: {
          fg: 'white',
          bg: 'black',
          border: {
            fg: 'blue'
          }
        }
      },
      border: {
        type: 'line'
      }
    });
  }
  
  // Create status bar (bottom of screen, full width)
  const statusBar = grid.set(10, 0, 2, 12, blessed.box, {
    tags: true,
    content: ' {bold}Status:{/bold} Ready',
    style: {
      fg: 'white',
      bg: 'blue'
    },
    padding: {
      left: 1,
      right: 1
    }
  });
  
  // Initialize components
  const fileTree = createFileTree({
    widget: fileTreePanel,
    projectRoot,
    agent
  });
  
  const outputRenderer = createOutputRenderer({
    widget: conversationPanel,
    tokenMonitor
  });
  
  const statusBarController = createStatusBar({
    widget: statusBar,
    apiClient,
    tokenMonitor
  });
  
  const inputHandler = createInputHandler({
    widget: inputBox,
    outputRenderer,
    agent,
    fileTree,
    screen
  });

  // Add a key binding to toggle focus to the conversation panel for scrolling
  screen.key(['C-f'], () => {
    conversationPanel.focus();
    statusBarController.update('Scroll mode active. Press Tab to return to input.');
    screen.render();
  });
  
  // Update the tab key handler to quickly switch between conversation and input
  screen.key(['tab'], () => {
    if (screen.focused === inputBox) {
      // From input, go directly to conversation
      conversationPanel.focus();
      statusBarController.update('Scroll mode active. Press Tab to return to input.');
    } else {
      // From anywhere else, go to input
      inputBox.focus();
      statusBarController.update('Ready for input');
    }
    screen.render();
  });
  
  // Add smoother wheel behavior for trackpad scrolling
  conversationPanel.on('wheeldown', () => {
    conversationPanel.scroll(1); // Scroll by just 1 line for smoother trackpad scrolling
    screen.render();
  });
  
  conversationPanel.on('wheelup', () => {
    conversationPanel.scroll(-1); // Scroll by just 1 line for smoother trackpad scrolling
    screen.render();
  });

  // Initialize agent command processor after other components
  let agentCommandProcessor = null;
  try {
    agentCommandProcessor = createAgentCommandProcessor({
      agent,
      llm: apiClient,
      screen,
      outputRenderer
    });
    
    // Add to input handler
    inputHandler.agentCommandProcessor = agentCommandProcessor;
    
    // Add help for agent commands
    if (agentCommandProcessor) {
      screen.key(['F1'], () => {
        const exampleCommands = agentCommandProcessor.getExampleCommands();
        
        outputRenderer.addSystemMessage('\n📚 Agent Command Examples:');
        exampleCommands.forEach(example => {
          outputRenderer.addSystemMessage(`• ${example}`);
        });
        
        outputRenderer.addSystemMessage('\nTry using these command patterns or press F1 again for more examples.');
        screen.render();
      });
    }
  } catch (error) {
    logger.error('Failed to initialize agent command processor:', error);
    // Continue without agent capabilities
  }


  
  // Set up key bindings
  screen.key(['C-c'], () => {
    return process.exit(0);
  });
  
  screen.key(['C-r'], () => {
    fileTree.refresh();
    statusBarController.update('Refreshing project files...');
  });
  
  screen.key(['C-l'], () => {
    conversationPanel.setContent('');
    screen.render();
    statusBarController.update('Conversation cleared');
  });
  
  screen.key(['C-s'], () => {
    // Save conversation implementation
    statusBarController.update('Conversation saved');
  });
  
  // Focus input by default
  inputBox.focus();
  
  // Initialize file tree
  fileTree.init();
  
  // Store editor mode flag on screen for other components to access
  screen.editorMode = editorMode;
  
  // Return the application object
  return {
    screen,
    statusBar: statusBarController,
    start: () => {
      // Initial rendering
      screen.render();
      
      if (editorMode) {
        // Special editor mode welcome
        outputRenderer.addSystemMessage('Welcome to FrankCode Editor Mode!');
        outputRenderer.addSystemMessage('• Type directly in the Text Editor panel');
        outputRenderer.addSystemMessage('• Use /save filename to save content');
        outputRenderer.addSystemMessage('• Use /load filename to load a file');
        statusBarController.update('Editor Mode - Type /help for commands');
      } else {
        // Regular welcome message
        outputRenderer.addSystemMessage('Welcome to FrankCode! Type your question or command below.');
        statusBarController.update('Ready');
      }
      
      // Other initialization...
    },
    destroy: () => {
      // Cleanup code...
      screen.destroy();
    }
  };
}

module.exports = {
  createApp
};