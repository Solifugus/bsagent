
Machine Agent Engine
Copyright (C) 2012, 2018 By Matthew C. Tedder
  Phone: 509-432-5520
  Email: matthewct@gmail.com
License: Refer to the LICENSE file (GNU LGPL)



# BSAgent 

A simple engine for emplementing a chatbot that is programmed thru a simple
scripting language (the "agent script").  Your agent mind may select and
compose its reactions based on what is in memory.

It's simple but relatively powerful -- vastly more powerful than typical 
chatbots used for customer service or sales, today (but that isn't saying
much).

## Description

The bsagent.js file contains the BSAgent object that should be instantiated
with an agent script.  The "myagent.js" file illustrates using the 
agent script in the file "100-script.bs"

The scripting language comprises a list of textual patterns to match each
expectable user statement.  Under each these is a list of selectable reactions,
optionally with a condition.  Each reaction thereafter comprises a sequence of
action commands.

Example:

```
Upon Hearing: Hello
	Consider If:
		Say "Hi.  What's your name?"

Upon Hearing: I am [something]
	Consider If: "asked user's name"
		Interpret As "my name is [name]"
	Consider If:
		Remember "user is [something]

Upon Hearing: my name is [name] 
	Consider If: 
		Remember "user's name is [name]"
```

The way intepretation works is that each user statement is matched against the
input patterns (that which follows "Ipon Hearing:") from the longest to the
shortest, whichever matches first.  Length is calculated by counting
characters 1 each but also counting any varialbe (with square brackets) as 1
also (so length of variable name will be irrelevant).

After that, any action commands are automatically executed, if before any "If:"
or "Consider If:" statement.  Any action commands after an "If:" statement is
executed if the condition is true.  Any action commands after a "Consider If:"
statement is considered optionally executable if its condition is true.  Where
there is no condition, it is automatically considered true.

The action commands are:

* `Say "output pattern"`
Responds to the user with the output pattern (a string, optionally with 
variables in square brackets in it).
* `Remember "output pattern"`
The same as the "Say" command except the output is recorded in memory.
It is not shown the the user.
* `Recall "input pattern"`
Identifies any memor(y/ies) from memory that match the input pattern.
In this case, variables in square brackets are written in, if they have
been read, but otherwise are read from matched memory.
* `Expect "input pattern" As "output pattern"`
This command sets up so that, if the next user statement matches the
input pattern that it will be interpreted as the user sayign the output
pattern.
* `Interpret As "output pattern"`
This command acts as if the user said the output pattern.  A reaction
may consist of any number of these.  Therefore, a user saying one thing
could be interpreted as the user saying potentially multiple things.
* `Request "output pattern"`
This functionality is incomplete.  However, the concept was to make a REST
web request.

## Getting Started

See the "myagent.js" file as an example of how to use the chatbot engine.

### Dependencies

There are no dependencies.

### Installing

You only need to add this to your project.  The chatbot engine is not
intended to be used standalone.  It's a library object to add to your
software project.

### Executing program

Once initialized, your code merely needs to call the  "respondTo()" method
(example: `let response = bsagent.respondTo('My name is Jackeroo.');`)

To read the memory stored up, refer to the `bsagent.memory` attribute.
It is merely an array of strings.

## Help

Refer to the "100-script.bs" file for examples.  I don't have a tutorial.
However if you need to, you can also email me.

## Authors

Matthew C. Tedder (matthewct@gmail.com)

## Version History

## License

GNU LGPL License

## Acknowledgments

I acknolwedge that this isn't the worst or best chatbot engine I have created.
However, it is better than any I've seen used for customer support or sales.

Other versions (that I have no made public) include:
	* an old one with a web GUI designer, 
	* a more advanced version of this one but with cascading contexts,
time triggers (e.g. `Say "It's time for your break!" In 15 Minutes`), the 
ability to seek and avoid outcomes, and to contemplate (among other things),
	* and finally my latest (not quite finished) "Mind Splicer", which is a hybrid connectionist-symbolic AI that can learn through observation, interaction, and surrogation.

