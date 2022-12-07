
const BSAgent = require('./bsagent.js');
const fs = require('fs');

let program = fs.readFileSync('./100-script.bs').toString();
agent = new BSAgent( program );

let response = agent.initialize("Hello");
console.log( response );

response = agent.respondTo('My name is Jackaroo.')
console.log( response );


