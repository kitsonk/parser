/* jshint node:true */

function mixin(destination, source) {
	for (var key in source) {
		destination[key] = source[key];
	}
	return destination;
}

var sendToCodeCov = require('codecov.io').handleInput;

module.exports = function (grunt) {
	grunt.loadNpmTasks('grunt-contrib-clean');
	grunt.loadNpmTasks('grunt-contrib-copy');
	grunt.loadNpmTasks('grunt-contrib-watch');
	grunt.loadNpmTasks('grunt-exec');
	grunt.loadNpmTasks('grunt-text-replace');
	grunt.loadNpmTasks('grunt-ts');
	grunt.loadNpmTasks('grunt-tslint');
	grunt.loadNpmTasks('grunt-coveralls');
	grunt.loadNpmTasks('grunt-cover-ts');
	grunt.loadNpmTasks('dts-generator');
	grunt.loadNpmTasks('intern');

	var tsconfigContent = grunt.file.read('tsconfig.json');
	var tsconfig = JSON.parse(tsconfigContent);
	var compilerOptions = mixin({}, tsconfig.compilerOptions);
	tsconfig.filesGlob = tsconfig.filesGlob.map(function (glob) {
		if (/^\.\//.test(glob)) {
			// Remove the leading './' from the glob because grunt-ts
			// sees it and thinks it needs to create a .baseDir.ts which
			// messes up the "dist" compilation
			return glob.slice(2);
		}
		return glob;
	});
	var packageJson = grunt.file.readJSON('package.json');

	grunt.initConfig({
		name: packageJson.name,
		version: packageJson.version,
		tsconfig: tsconfig,
		all: [ '<%= tsconfig.filesGlob %>' ],
		skipTests: [ '<%= all %>' , '!tests/**/*.ts' ],
		staticTestFiles: 'tests/**/*.{html,css}',
		devDirectory: '<%= tsconfig.compilerOptions.outDir %>',
		istanbulIgnoreNext: '/* istanbul ignore next */',

		clean: {
			dist: {
				src: [ 'dist/' ]
			},
			dev: {
				src: [ '<%= devDirectory %>' ]
			},
			src: {
				src: [ '{src,tests}/**/*.js' ],
				filter: function (path) {
					// Only clean the .js file if a .js.map file also exists
					var mapPath = path + '.map';
					if (grunt.file.exists(mapPath)) {
						grunt.file.delete(mapPath);
						return true;
					}
					return false;
				}
			},
			coverage: {
				src: [ 'html-report/', 'lcov.info', 'coverage-final.json' ]
			}
		},

		copy: {
			staticFiles: {
				expand: true,
				cwd: '.',
				src: [ 'README.md', 'LICENSE', 'package.json', 'bower.json' ],
				dest: 'dist/'
			},
			staticTestFiles: {
				expand: true,
				cwd: '.',
				src: [ '<%= staticTestFiles %>' ],
				dest: '<%= devDirectory %>'
			},
			typings: {
				expand: true,
				cwd: 'typings/',
				src: [ '**/*.d.ts', '!tsd.d.ts' ],
				dest: 'dist/typings/'
			}
		},

		dtsGenerator: {
			options: {
				baseDir: 'src',
				name: '<%= name %>'
			},
			dist: {
				options: {
					out: 'dist/typings/<%= name %>/<%= name %>-<%= version %>.d.ts'
				},
				src: [ '<%= skipTests %>' ]
			}
		},

		intern: {
			options: {
				grep: grunt.option('grep') || '.*',
				runType: 'runner',
				config: '<%= devDirectory %>/tests/intern'
			},
			runner: {
				options: {
					reporters: [
						{ id: 'Console' },
						{ id: 'JsonCoverage' }
					]
				}
			},
			local: {
				options: {
					config: '<%= devDirectory %>/tests/intern-local',
					reporters: [ 'runner', 'lcovhtml', 'lcov' ]
				}
			},
			client: {
				options: {
					runType: 'client',
					reporters: [
						{ id: 'Pretty' },
						{ id: 'JsonCoverage' }
					]
				}
			},
			proxy: {
				options: {
					proxyOnly: true
				}
			}
		},

		rename: {
			sourceMaps: {
				expand: true,
				cwd: 'dist/',
				src: [ '**/*.js.map', '!_debug/**/*.js.map' ],
				dest: 'dist/_debug/'
			}
		},

		rewriteSourceMaps: {
			dist: {
				src: [ 'dist/_debug/**/*.js.map' ]
			}
		},

		replace: {
			addIstanbulIgnore: {
				src: [ '<%= devDirectory %>/**/*.js' ],
				overwrite: true,
				replacements: [
					{
						from: /^(var __(?:extends|decorate) = )/gm,
						to: '$1<%= istanbulIgnoreNext %> '
					},
					{
						from: /^(\()(function \(deps, )/m,
						to: '$1<%= istanbulIgnoreNext %> $2'
					}
				]
			}
		},

		ts: {
			options: mixin(
				compilerOptions,
				{
					failOnTypeErrors: true,
					fast: 'never'
				}
			),
			dev: {
				outDir: '<%= devDirectory %>',
				src: [ '<%= all %>' ]
			},
			dist: {
				options: {
					mapRoot: '../dist/_debug'
				},
				outDir: 'dist',
				src: [ '<%= skipTests %>' ]
			}
		},

		tslint: {
			options: {
				configuration: grunt.file.readJSON('tslint.json')
			},
			src: {
				src: [
					'<%= all %>',
					'!typings/**/*.ts',
					'!tests/typings/**/*.ts'
				]
			}
		},

		coveralls: {
			src: 'lcov.info'
		},

		codecov_io: {
			src: 'coverage-final.json'
		},

		map_coverage_json: {
			files: {
				src: 'coverage-final.json'
			}
		},

		map_coverage: {
			options: {
				reports: {
					'json': 'coverage-final.json',
					'lcovonly': 'lcov.info',
					'html': 'html-report'
				}
			},
			files: {
				src: 'coverage-final.json'
			}
		},

		exec: {
			codecov: 'cat coverage-final.json | ./node_modules/codecov.io/bin/codecov.io.js'
		},

		watch: {
			grunt: {
				options: {
					reload: true
				},
				files: [ 'Gruntfile.js', 'tsconfig.json' ]
			},
			src: {
				options: {
					atBegin: true
				},
				files: [ '<%= all %>', '<%= staticTestFiles %>' ],
				tasks: [
					'dev'
				]
			}
		}
	});

	grunt.registerMultiTask('codecov_io', function () {
		this.filesSrc.forEach(function (file) {
			sendToCodeCov(grunt.file.read(file), function (err) {
				if (err) {
					grunt.log.error('error sending to codecov.io');
					grunt.log.errorlns(err);
					grunt.log.errorlns(err.stack);
					if (/non-success response/.test(err.message)) {
						grunt.log.error('detail: ' + err.detail);
					}
				}
			});
		});
	});

	grunt.registerMultiTask('rewriteSourceMaps', function () {
		this.filesSrc.forEach(function (file) {
			var map = JSON.parse(grunt.file.read(file));
			var sourcesContent = map.sourcesContent = [];
			var path = require('path');
			map.sources = map.sources.map(function (source, index) {
				sourcesContent[index] = grunt.file.read(path.resolve(path.dirname(file), source));
				return source.replace(/^.*\/src\//, '');
			});
			grunt.file.write(file, JSON.stringify(map));
		});
		grunt.log.writeln('Rewrote ' + this.filesSrc.length + ' source maps');
	});

	grunt.registerMultiTask('rename', function () {
		this.files.forEach(function (file) {
			if (grunt.file.isFile(file.src[0])) {
				grunt.file.mkdir(require('path').dirname(file.dest));
			}
			require('fs').renameSync(file.src[0], file.dest);
			grunt.verbose.writeln('Renamed ' + file.src[0] + ' to ' + file.dest);
		});
		grunt.log.writeln('Moved ' + this.files.length + ' files');
	});

	grunt.registerTask('updateTsconfig', function () {
		var tsconfig = JSON.parse(tsconfigContent);
		tsconfig.files = grunt.file.expand(tsconfig.filesGlob);

		var output = JSON.stringify(tsconfig, null, '\t') + require('os').EOL;
		if (output !== tsconfigContent) {
			grunt.file.write('tsconfig.json', output);
			tsconfigContent = output;
		}
	});

	grunt.registerTask('dev', [
		'ts:dev',
		'copy:staticTestFiles',
		'replace:addIstanbulIgnore',
		'updateTsconfig'
	]);
	grunt.registerTask('dist', [
		'ts:dist',
		'rename:sourceMaps',
		'rewriteSourceMaps',
		'copy:typings',
		'copy:staticFiles',
		'dtsGenerator:dist'
	]);
	grunt.registerTask('test', [ 'dev', 'intern:client', 'map_coverage' ]);
	grunt.registerTask('test-runner', [ 'dev', 'intern:runner' ]);
	grunt.registerTask('test-local', [ 'dev', 'intern:local' ]);
	grunt.registerTask('test-proxy', [ 'dev', 'intern:proxy' ]);
	grunt.registerTask('ci', [ 'test', 'test-runner', 'map_coverage', 'exec:codecov' ]);
	grunt.registerTask('default', [ 'clean', 'dev' ]);
};
