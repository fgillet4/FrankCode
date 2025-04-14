/**
 * Output Renderer for TUI
 * 
 * Handles rendering of messages in the conversation panel
 */

const chalk = require('chalk');
const { logger } = require('../utils');
const { formatTimestamp } = require('../utils/formatters');

/**
 * Create an output renderer
 * 
 * @param {Object} options Configuration options
 * @param {Object} options.widget The output widget
 * @param {Object} options.tokenMonitor Token monitoring utility
 * @returns {Object} The output renderer interface
 */
function createOutputRenderer({ widget, tokenMonitor }) {
  /**
   * Add a user message to the conversation
   * 
   * @param {string} message Message text
   */
  function addUserMessage(message) {
    const timestamp = formatTimestamp(new Date());
    
    // Format and add the message
    widget.log(chalk.bold.green(`YOU [${timestamp}]:`));
    widget.log(message);
    widget.log(''); // Empty line for spacing
    
    // Auto-scroll to bottom after adding new content
    widget.setScrollPerc(100);
    
    // Render the screen
    widget.screen.render();
  }
  
  /**
   * Add an assistant message to the conversation
   * 
   * @param {string} message Message text
   */
  function addAssistantMessage(message) {
    const timestamp = formatTimestamp(new Date());
    
    // Format and add the message
    widget.log(chalk.bold.blue(`FRANKCODE [${timestamp}]:`));
    
    // Process message for code blocks
    const processedMessage = processMessageForFormatting(message);
    
    // Add each line
    processedMessage.forEach(part => {
      if (part.type === 'text') {
        widget.log(part.content);
      } else if (part.type === 'code') {
        addCodeBlock(part.content, part.language);
      }
    });
    
    widget.log(''); // Empty line for spacing
    
    // Auto-scroll to bottom after adding new content
    widget.setScrollPerc(100);
    
    // Render the screen
    widget.screen.render();
  }
  
  /**
   * Add a system message to the conversation
   * 
   * @param {string} message Message text
   */
  function addSystemMessage(message) {
    // Format and add the message with nicer formatting
    widget.log(chalk.bold.yellow('┌─ SYSTEM ────────────────────────────────────'));
    
    // Split multi-line messages
    const lines = message.split('\n');
    lines.forEach(line => {
      widget.log(chalk.yellow('│ ') + line);
    });
    
    widget.log(chalk.bold.yellow('└────────────────────────────────────────────'));
    widget.log(''); // Empty line for spacing
    
    // Auto-scroll to bottom after adding new content
    widget.setScrollPerc(100);
    
    // Render the screen
    widget.screen.render();
  }
  
  /**
   * Add an error message to the conversation
   * 
   * @param {string} message Error message
   */
  function addErrorMessage(message) {
    // Format and add the message with nicer formatting
    widget.log(chalk.bold.red('┌─ ERROR ─────────────────────────────────────'));
    
    // Clean up any raw error text for better presentation
    const cleanedMessage = message
      .replace(/\{.*?\}/g, '') // Remove JSON objects
      .replace(/ECONNREFUSED/g, 'Connection Refused')
      .replace(/http:\/\/localhost:[0-9]+\/api\/generate/g, 'Ollama API')
      .replace(/connect ECONNREFUSED ::1:[0-9]+/g, 'Could not connect to Ollama API')
      .trim();
    
    // Split multi-line error messages
    const lines = cleanedMessage.split('\n');
    lines.forEach(line => {
      widget.log(chalk.red('│ ') + line);
    });
    
    widget.log(chalk.bold.red('└────────────────────────────────────────────'));
    widget.log(''); // Empty line for spacing
    
    // Auto-scroll to bottom after adding new content
    widget.setScrollPerc(100);
    
    // Render the screen
    widget.screen.render();
  }
  
  /**
   * Add a code block to the conversation
   * 
   * @param {string} code Code text
   * @param {string} language Programming language
   */
  function addCodeBlock(code, language = '') {
    // Create a nicer code block header
    widget.log(chalk.bold.cyan(`┌─ ${language || 'Code'} ${'─'.repeat(Math.max(0, 40 - language.length))}`));
    
    // Add the code with line numbers
    const lines = code.split('\n');
    lines.forEach((line, index) => {
      // Add line numbers for longer code blocks
      if (lines.length > 5) {
        const lineNum = String(index + 1).padStart(3, ' ');
        widget.log(chalk.dim(`│ ${lineNum} │`) + ' ' + line);
      } else {
        widget.log(chalk.dim('│') + ' ' + line);
      }
    });
    
    // Add a nice footer
    widget.log(chalk.bold.cyan(`└${'─'.repeat(44)}`));
    widget.log(''); // Empty line for spacing
    
    // Auto-scroll to bottom after adding new content
    widget.setScrollPerc(100);
    
    // Render the screen
    widget.screen.render();
  }
  
  /**
   * Process a message to extract code blocks
   * 
   * @param {string} message Message text
   * @returns {Array<Object>} Processed message parts
   */
  function processMessageForFormatting(message) {
    const parts = [];
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
    
    let lastIndex = 0;
    let match;
    
    // Find all code blocks
    while ((match = codeBlockRegex.exec(message)) !== null) {
      // Add text before the code block
      if (match.index > lastIndex) {
        parts.push({
          type: 'text',
          content: message.slice(lastIndex, match.index)
        });
      }
      
      // Add the code block
      parts.push({
        type: 'code',
        language: match[1],
        content: match[2]
      });
      
      lastIndex = match.index + match[0].length;
    }
    
    // Add remaining text
    if (lastIndex < message.length) {
      parts.push({
        type: 'text',
        content: message.slice(lastIndex)
      });
    }
    
    // If no code blocks were found, return the whole message as text
    if (parts.length === 0) {
      parts.push({
        type: 'text',
        content: message
      });
    }
    
    return parts;
  }
  
  /**
   * Process file modification code blocks
   * 
   * @param {string} message Message text
   * @returns {Array<Object>} File modifications
   */
  function processFileModifications(message) {
    const modifications = [];
    const fileBlockRegex = /```file:(.*?)\n([\s\S]*?)```/g;
    
    let match;
    while ((match = fileBlockRegex.exec(message)) !== null) {
      const filePath = match[1].trim();
      const content = match[2];
      
      modifications.push({
        filePath,
        content
      });
    }
    
    return modifications;
  }
  
  /**
   * Clear the conversation
   */
  function clear() {
    widget.setContent('');
    widget.screen.render();
  }
  
  // Return the output renderer interface
  return {
    addUserMessage,
    addAssistantMessage,
    addSystemMessage,
    addErrorMessage,
    addCodeBlock,
    processFileModifications,
    clear
  };
}

module.exports = {
  createOutputRenderer
};