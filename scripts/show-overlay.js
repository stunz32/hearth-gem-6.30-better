const { ipcRenderer } = require('electron');

// Send a message to toggle the overlay
console.log('Sending toggle-overlay message to show the overlay');
ipcRenderer.send('toggle-overlay');
 
// Also send a test message to display some cards
console.log('Sending test cards to display');
ipcRenderer.send('test-display-cards'); 