#!/usr/bin/env node
/**
 * A simple dump grepper based on the DumpReader module.
 */
"use strict";

var dumpReader = require('./dumpReader.js'),
	events = require('events'),
	util = require('util'),
	yargs = require('yargs');
    require('colors');

var extList = "categorytree ce charinsert chem gallery graph hiero imagemap indicator inputbox maplink math nowiki poem pre ref references score section source syntaxhighlight templatedata timeline".split(/\s+/g);
var extRegexp = new RegExp('^<(' + extList.join('|') + ')(\\s|>)', 'i');

function removeExtensions ( str ) {
	var inExt = false;
	return str.split(/(<\/?[^<>]*>)/g).filter(function(s) {
		if (inExt) {
			if (s==inExt) { inExt = false; }
			return false;
		} else {
			var m = extRegexp.exec(s);
			if (m) {
				// HACK? Don't strip <ref> or <references> for now,
				// since they contain wikitext which may be affected.
				if (/^(ref|references)$/.test(m[1])) {
					return true;
				}
				if (!/\/>$/.test(s)) {
					inExt = '</' + m[1] + '>';
				}
				return false;
			}
			return true;
		}
	}).join('');
}

function DumpGrepper ( regexp ) {
	// inherit from EventEmitter
	events.EventEmitter.call(this);
	this.re = regexp;
}

util.inherits(DumpGrepper, events.EventEmitter);

DumpGrepper.prototype.grepRev = function ( revision, opts ) {
	var onlyFirst = !!(opts && opts.onlyFirst),
		lineMode = !!(opts && opts.lineMode),
		cleaned = (opts && opts.removeExtensions) ?
			removeExtensions(revision.text) : revision.text,
		matches = [],
		re = this.re,
		source = lineMode ? cleaned.split(/\r\n?|\n/g) : [ cleaned ];
	source.forEach(function(text) {
		var negate,
			match,
			success,
			result;
		while (true) {
			if (onlyFirst && matches.length) return;
			negate = false; match = null;
			for (var i=0; i<re.length; i++) {
				if (re[i] === '!') { negate = !negate; continue; }
				result = re[i].exec(text);
				success = negate ? (!result) : (!!result);
				if (!success) return; // done with this text
				// first non-negated match becomes the result.
				if (result && !match) { match = result; }
			}
			matches.push( { match: match, text: text } );
			if (lineMode) return;
		}
	});
	if ( matches.length ) {
		this.emit( 'match', revision, matches );
	}
};

module.exports.DumpGrepper = DumpGrepper;

if (module === require.main) {
	var opts = yargs.usage( 'Usage: zcat dump.xml.gz | $0 <regexp>', {
		'e': {
			description: 'Remove contents of extension tags',
			'boolean': true,
			'default': false
		},
		'i': {
			description: 'Case-insensitive matching',
			'boolean': true,
			'default': false
		},
		'm': {
			description: 'Treat ^ and $ as matching beginning/end of *each* line, instead of beginning/end of entire article',
			'boolean': true,
			'default': false
		},
		'line': {
			description: 'Run regular expression over each line of the article individually.',
			'boolean': true,
			'default': false
		},
		'color': {
			description: 'Highlight matched substring using color. Use --no-color to disable.  Default is "auto".',
			'default': 'auto'
		},
		'l': {
			description: 'Suppress  normal  output;  instead  print the name of each article from which output would normally have been  printed.',
			'boolean': true,
			'default': false
		}
	} );
	var argv = opts.argv;

	if( argv.help ) {
		opts.showHelp();
		process.exit( 0 );
	}

	var lineMode = argv.line;
	var flags = lineMode ? '' : 'g';
	if( argv.i ) {
		flags += 'i';
	}
	if( argv.m ) {
		flags += 'm';
	}

    var colors = require('colors');
    if( argv.color === 'auto' ) {
        if (!process.stdout.isTTY) {
            colors.mode = 'none';
        }
    } else if( !argv.color ) {
        colors.mode = 'none';
    }

	var negate = false;
	var re = argv._.map(function(r) {
		if (r=='!') { return r; }
		return new RegExp( r, flags );
	});
	var onlyFirst = argv.l;

	console.log(re);
	var reader = new dumpReader.DumpReader(),
		grepper = new DumpGrepper( re ),
		stats = {
			revisions: 0,
			matches: 0
		};

	reader.on( 'revision', function ( revision ) {
		stats.revisions++;
		grepper.grepRev( revision, {
			onlyFirst: onlyFirst,
			lineMode: lineMode,
			removeExtensions: argv.e
		});
	} );

	grepper.on( 'match', function ( revision, matches ) {
		stats.matches++;
		if ( argv.l ) {
			console.log( revision.page.title );
			return;
		}
		console.log( '== Match: [[' + revision.page.title + ']] ==' );
		for ( var i = 0, l = matches.length; i < l; i++ ) {
			var m = matches[i];
			if (lineMode) {
				console.log(m.text.substr( 0, m.match.index ) +
							m.match[0].green +
							m.text.substr( m.match.index + m.match[0].length ));
			} else {
				console.log(
					m.text.substr( m.match[0].index - 40, 40 ) +
					m.match[0].green +
						m.text.substr( m.match[0].index + m.match[0].length, 40 ) );
			}
		}
	} );

	process.stdin.on ( 'end' , function() {
		// Print some stats
		console.warn( '################################################' );
		console.warn( 'Total revisions: ' + stats.revisions );
		console.warn( 'Total matches: ' + stats.matches );
		console.warn( 'Ratio: ' + (stats.matches / stats.revisions * 100) + '%' );
		console.warn( '################################################' );
	} );

	process.stdin.on('data', reader.push.bind(reader) );
	process.stdin.setEncoding('utf8');
	process.stdin.resume();


}

