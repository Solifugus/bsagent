
// Machine Agent Engine
//  Copyright (C) 2012, 2018 By Matthew C. Tedder
//  Phone: 509-432-5520
//  Email: matthewct@gmail.com
// License: LGPL v2, as per included "LICENSE" file

function BSAgent( script ) {
	this.debug      = false;  // Show debug info or not
	this.time;                // time when most recent user statement was received
	this.meanings     = [];   // {recognizer:'',reactions:[{condition:'',actions:[{command:'',parameters:[],run:{}}]}]}
	this.synonyms     = {};   // e.g. {'yes':['y','yep','sure','why not']}
	this.conjugations = [];   // e.g. [{from:'I',to:'you'},..]
	this.groups       = {};   // for restricted variables: {'past tense verb':['was','had']}
	this.memory       = [];   // {thought:'',posted:0,expires:0,contemplating:''},..
	this.working      = {};   // variables relative to the concurrent response formation
	this.context      = {};   // cross-response contextual variables (always added to working), e.g. [user], [it], [them], etc.
	this.expectations = {};   // {'expected':'interpret as'}
	
	this.commands = [
		{ syntax:/synonyms\s+([A-Za-z \-]+):(.*)/i,          name:'synonyms' },
		{ syntax:/group\s+(.+):(.*)/i,                       name:'group' },
		{ syntax:/conjugate\s+"([^"]*)"\s+to\s+"([^"]*)"/i,  name:'conjugate' },
		{ syntax:/always\s+recall\s+(.*)/i,                  name:'always recall' },
		{ syntax:/respond to\s*:(.*)/i,                      name:'recognizer' },
		{ syntax:/condition\s*:(.*)/i,                       name:'reaction' },
		{ syntax:/say\s+"([^"]*)"/i,                         name:'say' },
		{ syntax:/remember\s+"([^"]*)"/i,                    name:'remember' },
		{ syntax:/forget\s+"([^"]*)"/i,                      name:'forget' },
		{ syntax:/recall\s+"([^"]*)"/i,                      name:'recall' },
		{ syntax:/interpret\s+as\s+"([^"]*)"/i,              name:'interpret as' },
		{ syntax:/expect\s+"([^"]*)"\s+as\s+"([^"]*)"/i,     name:'expect as' },
		{ syntax:/request\s+"([^"]*)"/i,                     name:'request' },
	];

	// Initialization of the Agent
	this.initialize = function initialize( statement ) {
		var response;
		if( typeof script == 'string' ) {
			this.importScript( script, true );
			response = this.respondTo( statement );
		}
		else {
			response = 'ERROR: I have no mind.';
		}
		return response;
	}
	
	this.respondTo = function respondTo( user_statement ) {
		var date      = new Date();
		this.time     = date.getTime();  // time user statement was received
		this.working  = {};              // variables relative to this response formation
		
		var response = '';
		
		$('#debug').append('Received statement "' + user_statement + '"<br/>');  // DEBUG
		
		// Special Meta Commands
		/*
		if( user_statement == '/memory' ) {
			alert( 'CONTEXTUAL: ' + JSON.stringify( this.context, null, '  ' ) );
			alert( 'LONG TERM: ' + JSON.stringify( this.memory, null, '  ' ) );
			return '(The agent has ' + this.memory.length + ' memories.)';
		}

		if( user_statement == '/synonyms' ) {
			return 'The agent has ' + this.synonyms.length + ' synonyms: ' + JSON.stringify( this.synonyms, null, '  ' );
		}

		if( user_statement == '/conjugations' ) {
			alert( JSON.stringify( this.conjugations, null, '  ' ) );
			return '(The agent has ' + this.conjugations.length + ' conjugations.)';
		}

		if( user_statement == '/expectations' ) {
			alert( JSON.stringify( this.expectations, null, '  ' ) );
			return '(note that expectations only last one one cycle)';
		}
		*/
		
		// If particular answer expectable, translate it from relative to universal statement; e.g., "no" might be translated to "I do not like bacon."
		user_statement = this.getExpectedAsTranslation( user_statement );
		
		var matches  = this.getMatchingMeanings( user_statement );                  // Gets array of recognizers
		var actions  = this.getReaction( matches );                                 // Gets action sequence
		var response = this.performReaction( actions.actions, actions.variables );  // Gets results of action sequence
		return response;
	}
	
	this.getExpectedAsTranslation = function getExpectedAsTranslation( user_statement ) {
		for( key in this.expectations ) {
			// TODO: make it so "key" can be a recognizer
			if( user_statement == key ) {
				user_statement = this.expectations[key];
				// TODO: inject any variables from the recognizer into the user_statement
			}
		}
		return user_statement;
	}
	
	// An array of meanings is returned where by the global (default) meaning is returned
	// first and all matching meanings thereafter.  
	this.getMatchingMeanings = function getMatchingMeanings( statement ) {
		// Apply any synonym translations to statement
		// Note: Would be nice to have these depend on contexts; the contexts could overlap but with a specified order of presidence. 
		for( mainWord in this.synonyms ) {
			var pattern   = '';
			var separator = '';
			for( var i = 0; i < this.synonyms[mainWord].length; i += 1 ) {
				pattern += separator + '\\b' + this.synonyms[mainWord][i] + '\\b';
				separator = '|';
			}
			statement = statement.replace(new RegExp(pattern, 'gi'),mainWord);
		}

		// Collect meanings with matching recognizers 
		var matches = [];
		for( var m = 0; m < this.meanings.length; m += 1 ) {
			var meaning       = this.meanings[m];  // just an easier reference
			meaning.variables = {};                // erase any previously collected variables
			
			// Collect any meaning with blank recognizer--these will be done regardless user's statement
			if( meaning.recognizer.pattern == '' ) {
				matches.push( meaning );
				continue;
			}

			
			// Collect any meanings with matching recognizers 
			var match = statement.match(meaning.recognizer.pattern);
			if( match != null ) {
				for( v = 0; v < meaning.recognizer.variables.length; v += 1 ) {
					meaning.variables[ meaning.recognizer.variables[v] ] = match[v+1].trim();
				}
				matches.push( meaning );
			}
		}
		return matches;
	}
	
	// Returns a list of actions, taken from a selected reaction from the global meaning (if any), 
	// and the first meaning thereafter for which there is a valid reaction. 
	this.getReaction = function getReaction( matches ) {
		// Find first match with at least one valid reaction
		var found = false;
		var prepended = [];
		var reactions = [];
		var variables = [];
		for( var m = 0; m < matches.length; m += 1 ) {
			for( r = 0; r < matches[m].reactions.length; r += 1 ) {
				if( this.isTrue( matches[m].reactions[r].condition, matches[m].variables ) ) {
					// Always prepended to action sequences from meaning 0 (global) or condition null (unconditional)
					if( m == 0 || matches[m].reactions[r].condition === null ) {
						prepended = prepended.concat( matches[m].reactions[r].actions );
						continue;
					}
					
					// Found first valid conditional reaction--look no further 
					found = true;
					reactions.push( matches[m].reactions[r] );
					variables.push( matches[m].variables );
				}
			}
			// If found valid reaction, go with it (else keep looking, even into other meanings from more to less specific
			if( found ) {
				break;
			}
		}

		//alert( 'Choice of Reactions: ' + JSON.stringify( reactions, null, '  ' ) );
		if( !found ) {
			logMessage( 'Problem: Script lacks a catch-all.' );
			// TODO: after import of script, add a catch-all if one wasn't given.
		}
		
		// No sense in a selection process if there is only one reaction to select
		if( reactions.length == 1 ) { // *** TODO FIX: Does this leave variables out of alignment? ***
			return {actions:prepended.concat( reactions[0].actions ), variables:variables[0]};
		}
		
		// Select Human, Rotational, or Random (default Human)
		var paradigm = 'human';  // TODO: default to human
		var selected = undefined;
		switch( paradigm ) {
				case 'rotational':
					selected = this.selectRotationalReaction( reactions );
					break;
				case 'random':
					selected = this.selectRandomReaction( reactions );
					break;
				case 'human':
				default:
					selected = this.selectHumanReaction( reactions );
		}
		// TODO: ensure valid global actions are included.. in the below return
		// FIX: Variables out of whack, due to prepended globals?
		return {actions:prepended.concat( reactions[selected].actions ), variables:variables[selected]};
	}
	
	this.isTrue = function isTrue( condition, variables ) {
		// Default empty to true
		if( condition === null || condition.trim() == '' ) return true;
		
		// Add context variables, unless same-named variable captured from recognizer
		for( key in this.context ) {
			if( variables[key] == undefined && this.context[key] != undefined && this.context[key] != '') {
				variables[key] = this.context[key];
			}
		}
		
		// For each quoted text in the condition, replace with count of matches in memory
		var start = 0;
		var end   = -1;
		
		while( start != -1 ) {
			start = condition.indexOf('"',end+1);
			if( start != -1 ) {
				end = condition.indexOf('"',start+1);
				if( end == -1 ) {
					logMessage( 'ERROR: Missing closing quote in condition "' + condition + '"' );
					return false;
				}
				var count = this.numberOfMatchingMemories( condition.substring(start,end) );
				condition = condition.slice(0,start) + count + condition.slice(end+1);
				end = start;
			}
		}
		
		// Scrub anything invalid out of the condition
		var clean = '';
		var words = condition.wordsOf();
		for( var w = 0; w < words.length; w += 1 ) {
			var word = words[w].toLowerCase();
			if( !isNaN(word) || word == ' ' || word == '>' || word == '<' || word == '=' || word == '!' || word == 'and' || word == 'or' || word == 'not' || word == '(' || word == ')' ) {
				if( word == 'and' ) word = '&&';
				if( word == 'or' ) word = '||';
				if( word == 'not' ) word = '!';
				if( word == '=' ) word = '==';
				clean += word;
			}
			else {
				logMessage( 'Condition "' + condition + '" is not valid syntax' );
				return false;
			}
		}
		
		return eval( clean );
	}
	
	this.numberOfMatchingMemories = function numberOfMatchingMemories( message, variables ) {
		// Inject any known variable values
		for( var key in variables ) {
			message = message.replace('['+key+']',variables[key]);
		}
		
		// Remove any remaining brackets
		message = message.replace(/\[|\]/g,'');
		
		// Create the regular expression pattern to find and count matches
		var pattern = this.patternOfRecognizer( message, true, false );
		
		// Count matching memories
		var count = 0;
		for( var m = 0; m < this.memory.length; m += 1 ) {
			var memory =  this.memory[m];
			found = memory.thought.match( pattern.pattern );
			if( found != null ) count += 1;
		}
		return count;
	}
	
	this.selectRotationalReaction = function selectRotationalReaction( reactions ) {
		var date = new Date();
		var current = date.getTime();
		var highest_ellapsed = 0;
		var highest_reaction = 0;
		for( var r = 0; r < reactions.length; r += 1 ) {
			// If never used, use it now
			if( reactions[r].last_selected == undefined ) {
				highest_reaction = r;
				break;
			}
			
			// Else calculate which was used the longest ago and use it
			var ellapsed = current - reactions[r].last_selected;
			if( ellapsed > highest_ellapsed ) {
				highest_ellapsed = ellapsed;
				highest_reaction = r;
			}
		}
		selected = highest_reaction;
		reactions[selected].last_selected = current;  // mark when reaction was selected
		return selected;
	}
	
	this.selectRandomReaction = function selectRandomReaction( reactions ) {
		var chosen = Math.floor( Math.random() * reactions.length );
		return chosen;
	}

	this.selectHumanReaction = function selectHumanReaction( reactions, graduation ) {
		if( graduation == undefined ) graduation = 5;  // default graduation (0 is 5 seconds)
		
		// Graduate according to the Graduated Interval Recall scale
		// 5 seconds, 25 second, 2 minutes, 10 minutes, 1 hour, 5 hours, 1 day, 5 days, 25 days, 4 months, 2 years
		var restoration = 5;  // start with 5 seconds.. then graduate
		for( var c = 1; c < graduation; c += 1 ) restoration = restoration * 5;
		
		// Convert seconds to milliseconds
		restoration = restoration * 1000;
		
		var date = new Date();
		var current = date.getTime();
		var highest_ellapsed = 0;
		var highest_reaction = 0;
		var selected = undefined;
		for( var r = 0; r < reactions.length; r += 1 ) {
			// If never used, use it now
			if( reactions[r].last_selected == undefined ) {
				highest_reaction = r;
				break;
			}
			
			// If not used for more than 10 minutes, use now
			var ellapsed = current - reactions[r].last_selected;
			if( ellapsed > restoration ) { 
				highest_reaction = r;
				break;
			}
			
			// Else calculate which was used the longest ago and use it
			var ellapsed = current - reactions[r].last_selected;
			if( ellapsed > highest_ellapsed ) {
				highest_ellapsed = ellapsed;
				highest_reaction = r;
			}
		}
		selected = highest_reaction;
		reactions[selected].last_selected = current;  // mark when reaction was selected
		return selected;
	}

	this.performReaction = function performReaction( actions, variables ) {
		var response = '';
		
		// Add context variables, unless same-named variable captured from recognizer
		for( key in this.context ) {  // TODO MAYBE: is already added in isTrue() function??
			if( variables[key] == undefined && this.context[key] != undefined && this.context[key] != '') {
				variables[key] = this.context[key];
			}
		}
		
		// Execute each action command in sequence
		for( var a = 0; a < actions.length; a += 1 ) {
			var action = actions[a];
			
			// Identify & Run Each Action, In Sequence
			switch( action.command.toLowerCase() ) {
				case 'synonyms':
					this.synonymCommand( action.parameters[0], action.parameters[1] );
					break;
				case 'group':
					this.groupCommand( action.parameters[0], action.parameters[1] );
					break;					
				case 'conjugate':
					this.conjugateCommand( action.parameters[0], action.parameters[1] );
					break;
				case 'always recall':
					this.alwaysRecallCommand( action.parameters[0] );
					break;
				case 'say':
					if( response.length > 0 ) response += '  ';
					response += this.sayCommand( action.parameters[0], variables );
					break;
				case 'remember':
					this.rememberCommand( action.parameters[0], variables );
					break;
				case 'forget':
					this.forgetCommand( action.parameters[0], variables );
					break;
				case 'recall':
					variables = this.recallCommand( action.parameters[0], variables );
					break;
				case 'interpret as':
					response += this.interpretAsCommand( action.parameters[0], variables );
					break;
				case 'expect as':
					this.expectAsCommand( action.parameters[0], action.parameters[1], variables );
					break;
				case 'request':
					this.requestCommand( action.parameters );
					break;
				default:
					logMessage( 'OMG: "' + action.command + '" is not a valid command -- why wasn\'t it caught as a syntax error?' );
			}
		}
		
		// Add any new values appropriate for Context (since all commands have been executed)
		for( key in variables ) {
			if( this.context[key] != undefined ) this.context[key] = variables[key];
		}
		
		return response;
	}
	
	//////////////////// Action Sequence Command Definitions ///////////////////
	this.synonymCommand = function synonymCommand( key, synonyms ) {
		// TODO: add variable injections into synonyms
		var synonyms = synonyms.split(',');
		for( var s = 0; s < synonyms.length; s += 1 ) { synonyms[s] = synonyms[s].trim(); }
		this.synonyms[key.trim()] = synonyms;
	}

	this.groupCommand = function groupCommand( key, words ) {
		// TODO: add variable injections into words
		var words = words.split(',');
		for( var g = 0; g < words.length; g += 1 ) { words[g] = words[g].trim(); }
		this.groups[key.trim()] = words;
	}
	
	this.conjugateCommand = function conjugateCommand( from, to ) {
		var found = false;
		for( var c = 0; c < this.conjugations.length; c += 1 ) {
			if( this.conjugations[c].from == from ) found = true; 
		}
		if( !found ) this.conjugations.push({from:from,to:to});
	}
	
	this.alwaysRecallCommand = function alwaysRecallCommand( variable ) {
		variable = variable.trim();
		if( variable != '' ) this.context[variable] = '';
	}
	
	this.sayCommand = function sayCommand( message, variables ) {
		// Replace variable names with values
		for( var key in variables ) {
			// Apply conjugations to convert between first and second person
			variable = this.applyConjugations(variables[key]);
			message = message.replace('['+key+']',variable);
		}
		
		// Remove any remaining brackets
		message = message.replace(/\[|\]/g,'');
		
		return message;
	}

	this.applyConjugations = function applyConjugations( message ) {
		var letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
		var rebuild = '';
		for( var i = 0; i < message.length; i += 1 ) {
			var found_conjugation = false;
			for( var c = 0; c < this.conjugations.length; c += 1 ) {
				var conjugation = this.conjugations[c];
				//logMessage( 'Does "' + message.substr( i, conjugation.from.length ).toLowerCase() + '" = "' + conjugation.from.toLowerCase() + '"?' );
				if( message.substr( i, conjugation.from.length ).toLowerCase() == conjugation.from.toLowerCase() ) {
					// Found conjugation but make sure it is its own word(s) and not part of other words, e.g. "I" is not part of "It"
					var before, after;
				    if( i == 0 ) { before = ' '; } else { before = message.substr(i-1,1); }
					if( i + conjugation.from.length >= message.length ) { after = ' '; } else { after = message.substr( i + conjugation.from.length, 1 ); }
					//logMessage( 'Before "' + before + '", After "' + after + '"' );
					if( letters.indexOf( before ) == -1 && letters.indexOf( after ) == -1 ) {
						//logMessage( 'Yes, so "' + rebuild + '" gets "' + conjugation.to + '" appended yielding "' + rebuild + conjugation.to + '"' );
						found_conjugation = true;
						rebuild += conjugation.to;
						i += conjugation.from.length - 1;
						break;
					}
				}
			}
			if( !found_conjugation ) {
				rebuild += message.substr(i,1);
				//logMessage( 'No conjugations matched so we add one character making "' + rebuild + '"' );
			}
		}
		return rebuild;
	}
	
	this.rememberCommand = function rememberCommand( message, variables ) {
		// Replace any known variables with their values
		for( var key in variables ) {
			message = message.replace('['+key+']',variables[key]);
		}
		
		// Remove any remaining brackets
		message = message.replace(/\[|\]/g,'');
		
		// Trim punctuation off front and back
		message = message.replace(/(\.|\?|!|,)$/,'');
		
		// If exact memory already exists, remove it as to add updated version of it
		for( var m = 0; m < this.memory.length; m += 1 ) {
			if( this.memory[m].thought == message ) {
				logMessage( 'Yes--removing' );
				this.memory.splice( m, 1 );
			}
		}
		
		// Add this memory
		this.memory.push( {thought:message,posted:this.time,expires:null,contemplating:null } );
		if( this.debug ) logMessage( 'Remembered "' + message + '"' );
	}
	
	this.forgetCommand = function forgetCommand( message, variables ) {
		// Replace any known variables with their values
		for( var key in variables ) {
			message = message.replace('['+key+']',variables[key]);
		}
		
		// Remove any remaining brackets, except [*]
		message = message.replace(/\[|\]/g,'');  // TODO: make the [*] not get remove
		var pattern = this.patternOfRecognizer( message, true, false );
		
		// Find and remove any memories that match
		for( var m = 0; m < this.memory.length; m += 1 ) {
			var memory =  this.memory[m];
			found = memory.thought.match( pattern.pattern );
			if( found != null ) {
				if( this.debug ) logMessage( 'Forgot "' + memory.thought + '"' );
				this.memory.splice( m, 1 );
			}
		}
	}
	
	this.recallCommand = function recallCommand( message, variables ) {
		// Apply any known variables (the rest are for acquiring)
		// Replace any known variables with their values
		for( var key in variables ) {
			message = message.replace('['+key+']',variables[key]);
		}
		
		// Create the regular expression pattern to find and capture still unknown variables
		var pattern = this.patternOfRecognizer( message, true, false );
		
		// Search through memories for the one sought to recall from
		for( var m = 0; m < this.memory.length; m += 1 ) {
			var memory =  this.memory[m];
			found = memory.thought.match( pattern.pattern );
			if( found != null ) {
				if( this.debug ) logMessage( 'Recalling "' + memory.thought + '"' );
				for( var v = 0; v < pattern.variables.length; v += 1 ) {
					var variable = pattern.variables[v];
					var value = found[v+1].trim();
					// recall found memory variables for use in this response
					if( variables[variable] != undefined && variables[variable] != '' ) {
						// Ensure no duplicates
						if( variables[variable].indexOf( value ) == -1 ) {
							variables[variable] = value + ', and ' + variables[variable]; // TODO: mane and/or option
						}
					} 
					else {
						variables[variable] = value;
					}
					
					// recall found memory into context, if a key contextual variable
					if(this.context[variable] != undefined) this.context[variable] = variables[variable];
				}
			}
		}
		return variables;
	}
	
	this.interpretAsCommand = function interpretAsCommand( message, variables ) {
		return this.respondTo( this.sayCommand( message, variables ) );
	}
	
	this.expectAsCommand = function expectAsCommand( expectable, expected_as, variables ) {
		expected_as = expected_as.trim();
		expectable = expectable.trim();
		
		// inject any variables in expected and/or expectable
		for( var key in variables ) {
			expectable  = expectable.trim().replace('['+key+']',variable);
			expected_as = expected_as.trim().replace('['+key+']',variable);
		}
		
		// Remove any remaining brackets
		expectable  = expectable.replace(/\[|\]/g,'');
		expected_as = expected_as.replace(/\[|\]/g,'');

		// Store expectation so it can be expected
		this.expectations[expectable.trim()] = expected_as;
	}
	
	this.requestCommand = function requestCommand( parameters ) {
		logMessage( 'Request Command: ' + JSON.stringify( parameters[0] ) );
	}
	
	//////////////////// MindScript Importation ///////////////////
	this.importScript = function importScript( script, refresh ) {
		if( refresh != true ) refresh = false;  // Republican Logic
		
		// First meaning is global context--always matched
		var meaning  = {
				recognizer:{
					text:'',
					regex:'',
					pattern:'',
					variables:[]
				},
				priority:null,  // will be sorted to the top--first priority..
				reactions:[
					{
						condition:'',
						actions:[]
					}
				]
			};
			
		var reaction = meaning.reactions[0];
		var lines = script.split('\n');
		for( var line_no = 0; line_no < lines.length; line_no += 1 ) {
			// Remove comments and ignore blank lines
			line = lines[line_no].replace(/[^\x20-\x7E]+/g, '').trim().replace(/--.*/g,'');
			if( line.length == 0 ) continue;
			
			// Try to find recognizable statement
			var found   = undefined;
			var command = undefined;
			for( var c = 0; c < this.commands.length; c += 1 ) {
				this.commands[c].syntax.lastIndex = 0;
				found = line.match( this.commands[c].syntax );
				if( found !== null ) {
					command = this.commands[c];
					break;
				}
			}
			
			// If not found, note and skip to the next line
			if( found === undefined ) {
				logMessage( 'No instructable syntax found.' ); 
				continue;  // impossible to occur more than once but just checking..
			}
			if( found === null ) {
				logMessage( 'Syntax not recognized on line #' + line_no + ': ' + line ); 
				lines[line_no] = '-- Syntax not recognized: ' + lines[line_no];
				continue;
			}
			
			// Append found comment
			switch( command.name ) {
				case 'recognizer':
					this.meanings.push( meaning );
					meaning  = {
						recognizer:this.patternOfRecognizer(found[1],true,false),
						priority:this.lengthOfRecognizer(found[1]),
						reactions:[]
					};
					//console.log( 'Found Recognizer: ' + meaning.recognizer.text );
					reaction = {condition:null,actions:[]}; // captures conditionless actions
					meaning.reactions.push( reaction ); 
					break;
				case 'reaction':
					reaction = {
						condition:found[1].trim(),
						actions:[]
					};
					meaning.reactions.push( reaction );
					break;
				default:
					found.shift();
					reaction.actions.push( {
						command:command.name, 
						parameters:found, 
						run:command.run 
					} );
			}
			
		}
		// Push the last meaning (otherwise gets lost)
		this.meanings.push( meaning );

		// Eliminate any reactions without action sequences, from all meanings
		for( var m = 0; m < this.meanings.length; m += 1 ) {
			for( var r = 0; r < this.meanings[m].reactions.length; r += 1 ) {
				if( this.meanings[m].reactions[r].actions.length === 0 ) this.meanings[m].reactions.splice(r,1);
			}
		}
	
		// Sort meanings from longest to shortest, counting any variable as 1 character
		this.meanings.sort( function( a, b ) {
			if( a.priority == null ) return -1;
			if( b.priority == null ) return 1;
			if( a.priority < b.priority ) return 1;
			if( a.priority > b.priority ) return -1;
			return 0;
		});
	}
	
	this.lengthOfRecognizer = function lengthOfRecognizer( uncomparable ) {
		var comparable     = uncomparable.replace(/\[[\w ]*\]/g,'*');
		var numOfWords     = comparable.split(' ').length - 1;
		var numOfVariables = Number( '.' + (comparable.match(/\*/g) || []).length );
		return numOfWords - numOfVariables;
	}
	
	// Form a regular expression pattern from the recognizer given
	this.patternOfRecognizer = function patternOfRecognizer( recognizer, ignore_punctuation, match_full ) {
		if( recognizer == undefined || recognizer == '' ) return null;
		if( ignore_punctuation == undefined ) ignore_punctuation = true;
		if( match_full == undefined ) match_full = false;
		
		// Remove extra spaces 
		recognizer = recognizer.trim();                 // off front and back
		recognizer = recognizer.replace(/ {2,}/g,' ');  // within, two or more should be one
		
		// Escape any characters that have meaning in a regular expression
		//recognizer = recognizer.rescape();  // custom added function to String's prototype
		
		// Place and Track Wildcards
		var recognizer_regex = '';     // regular expression we are building to match meanings
		var wildcards        = [];     // in order, names of wildcards (in-betweens are numbered variables)
		var previous         = '';     // previous character
		var current          = '';     // current character
		var next             = '';     // next character
		var after_wildcard   = false;  // to know if a wildcard was just placed, as not to make two adjacent
		var ignore_until     = '';     // ignore characters until found; '' mean don't ignore
		for( var c = 0; c < recognizer.length; c += 1 ) {
			previous = current;
			current  = recognizer[c];
			next     = recognizer[c+1] != undefined ? recognizer[c+1] : '';
			if( previous == ' ' && current == ' ' ) continue;
			if( current == ignore_until ) {
				ignore_until = '';
				continue;
			}
			if( ignore_until != '' ) continue;
			if( current == ' ' && !after_wildcard ) {
				if( next == '[' ) continue;
				recognizer_regex += '(.*)';
				wildcards.push('inbetween'+wildcards.length);
				after_wildcard = true;
				continue;
			}
			if( current == '[' ) {
				var front = c + 1;
				var back  = recognizer.substr(c+1).indexOf(']')
				if( back == -1 ) { 
					// TODO: Error handling
					logMessage( 'Syntax Error: variable is openned but not closed' ); 
				}
				else {
					recognizer_regex += '(.*)';
					wildcards.push( recognizer.substr(front,back).trim() );
					after_wildcard = true;
					ignore_until = ']';
				}
				continue;
			}
			
			// Option to ignore punctuation
			punctuation = ' `~!@#$%^&*()_-+={[}]|\\<,>.?/:;"\'';
			if( ignore_punctuation && (punctuation.indexOf(current) > -1 ) ) continue;
			
			// Add literal character, escaping for regular expression, as necessary
			recognizer_regex += current.rescape();
			after_wildcard = false;
		}
		
		// Option to match as whole string or partial
		if( match_full ) { recognizer_regex = '^' + recognizer_regex + '$'; }
		//logMessage( 'Recognizer: "' + recognizer + '" becomes pattern /' + recognizer_regex + '/ with wildcards: ' + JSON.stringify( wildcards ) );
		
		regex = new RegExp( recognizer_regex, 'i' );  // TODO: flag for case sensitivity
		return {text:recognizer,regex:recognizer_regex,pattern:regex,variables:wildcards};
	}
}

// General Purpose Functions
function showMessage( message ) {
	$('#messages').html( message );
};

function logMessage( message ) {
	$('#debug').append( message + '<br/>' );
};


Date.prototype.hhmmss = function() {
	return 
	("0" + this.getHours()).slice(-2)   + ":" + 
    ("0" + this.getMinutes()).slice(-2) + ":" + 
    ("0" + this.getSeconds()).slice(-2);
}

// Escape Words Reserved in Regular Expressions
String.prototype.rescape = function() {
	return this.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
}

// Returns array of words, whitespace being one space, punctuation also separating
String.prototype.wordsOf = function ( punctuation ) {
	if( punctuation == undefined ) punctuation = ' `~!@#$%^&*()_-+={[}]|\\<,>.?/:;"\'';
	var statement = this.replace(/[^\x20-\x7E]+/g, '').replace(/\s{2,}/gm,' ');
	var words     = [];
	var word      = '';
	for( var i = 0; i < statement.length; i += 1 ) {
		// TODO: keep quoted text together as one-word
		var c = statement.substr( i, 1 );
		if( punctuation.indexOf( c ) != -1 ) {
			if( word.length > 0 ) words.push( word );
			words.push( c );
			word = '';
		}
		else {
			word += c;
		}
	}
	if( word.length > 0 ) words.push( word );
	return words;
};

// Convert recognizer to array of tokens (words/variables)
String.prototype.tokensOf = function ( punctuation ) {
	var words = this.wordsOf();
	var start = 0;
	while( start < words.length ) {
		var opens = words.indexOf('[',start)
		if( opens != -1 ) {
			var closes = words.indexOf(']',opens);
			if( closes != -1 ) {
				var variable = '';
				for( var v = opens+1; v <= closes-1; v += 1 ) variable += words[v];
				variable = '[' + variable.trim() + ']';
				words.splice(opens,closes-opens+1,variable);
				start = closes;
			}
			else break;  // didn't close opened variable..
		}
		else break;  // no more variable openings
	}
	var tokens = [];
	var token  = {type:'literal',value:[]};
	for( var w = 0; w < words.length; w += 1 ) {
		var word = words[w];
		if( word.substr(0,1) == '[' && word.substr(word.length-1,1) == ']' ) {
			// Came across a variable
			if( token.value.length > 0 ) tokens.push(token);
			tokens.push({type:'variable',value:word.substr(1,word.length-2)});
			token = {type:'literal',value:[]};
		}
		else {
			token.value.push( word );
		}
	}
	if( token.value.length > 0 ) tokens.push(token);
	return tokens;
};

String.prototype.isPunctuation = function ( punctuation ) {
	if( punctuation == undefined ) punctuation = ' `~!@#$%^&*()_-+={[}]|\\<,>.?/:;"\'';
	if( punctuation.indexOf( this ) == -1 ) { return false; } else { return true; }
}

// Not Used
String.prototype.synonymsOf = function ( synonym_groups ) {
	var synonyms = [];
	for( var g = 0; g < synonym_groups.length; g += 1 ) {
		for( var s = 0; s < synonym_groups[g].length; s += 1 ) {
			if( this.toLowerCase() == synonym_groups[g][s].toLowerCase() ) {
				// TODO
			}
		}
	}
}

// Not Used
function isSynonym( synonym_groups, text, position ) {
	var found    = false;
	var length   = undefined;
	var synonyms = [];
	for( var ss = 0; ss < synonym_groups.length; ss += 1 ) {
		synonyms = synonym_groups[ss];
		for( var s = 0; s < synonyms.length; s += 1 ) {
			var synonym = synonyms[s];
			length      = synonym.length;
			if( text.substr( position, length) == synonym ) {
				found = true;
				break;
			} 
		}
		if( found ) break;
	}
	return { found:found, length:length, synonyms:synonyms };
}

module.exports = BSAgent;

