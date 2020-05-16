(async () =>
{
	const apiFetch = await fetch( 'api.json' );
	const interfaces = await apiFetch.json();

	const flattenedMethods = [];

	for( const interfaceName in interfaces )
	{
		for( const methodName in interfaces[ interfaceName ] )
		{
			const method = interfaces[ interfaceName ][ methodName ];

			if( method.parameters )
			{
				for( const parameter of method.parameters )
				{
					parameter._value = '';
				}
			}

			flattenedMethods.push( {
				interface: interfaceName,
				method: methodName,
			} );
		}
	}

	const fuzzy = new Fuse( flattenedMethods, {
		shouldSort: true,
		threshold: 0.3,
		keys: [ {
			name: 'interface',
			weight: 0.3
		}, {
			name: 'method',
			weight: 0.7
		} ]
	} );

	const app = new Vue({
		el: '#app',
		data:
		{
			userData:
			{
				webapi_key: localStorage.getItem( 'webapi_key' ) || '',
				steamid: localStorage.getItem( 'steamid' ) || '',
				format: localStorage.getItem( 'format' ) || 'json',
			},
			currentFilter: '',
			currentInterface: null,
			skipInterfaceSet: false,
			interfaces: interfaces,
		},
		watch:
		{
			"userData.format"( value )
			{
				localStorage.setItem( 'format', value );
			},
			"userData.webapi_key"( value )
			{
				if( this.isFieldValid( 'webapi_key' ) )
				{
					localStorage.setItem( 'webapi_key', value );
				}
				else
				{
					localStorage.removeItem( 'webapi_key' );
				}
			},
			"userData.steamid"( value )
			{
				if( this.isFieldValid( 'steamid' ) )
				{
					localStorage.setItem( 'steamid', value );

					fillSteamidParameter();
				}
				else
				{
					localStorage.removeItem( 'steamid' );
				}
			},
			currentInterface( newInterface )
			{
				if( newInterface )
				{
					document.title = `${newInterface} – Steam Web API Documentation`;
				}
				else
				{
					document.title = `Steam Web API Documentation`;
				}

				if( this.skipInterfaceSet )
				{
					this.skipInterfaceSet = false;

					return;
				}

				history.replaceState( '', '', '#' + newInterface );
			},
		},
		mounted()
		{
			document.getElementById( 'loading' ).remove();
		},
		computed:
		{
			filteredInterfaces()
			{
				if( !this.currentFilter )
				{
					return interfaces;
				}

				const matches = fuzzy.search( this.currentFilter );
				const matchedInterfaces = {};

				for( const searchResult of matches )
				{
					const match = searchResult.item;

					if( !matchedInterfaces[ match.interface ] )
					{
						matchedInterfaces[ match.interface ] = {};
					}

					matchedInterfaces[ match.interface ][ match.method ] = this.interfaces[ match.interface ][ match.method ];
				}

				this.currentInterface = matches.length > 0 ? matches[ 0 ].item.interface : '';

				return matchedInterfaces;
			},
			interface()
			{
				return this.filteredInterfaces[ this.currentInterface ];
			},
		},
		methods:
		{
			isFieldValid( field )
			{
				switch( field )
				{
					case 'webapi_key': return /^[0-9a-f]{32}$/i.test( this.userData[ field ] );
					case 'steamid': return /^[0-9]{17}$/.test( this.userData[ field ] );
				}
			},
			renderUri( methodName, method )
			{
				let host = 'https://api.steampowered.com/';
				let version = method.version;

				if( method._type === 'dota2' )
				{
					host = 'https://www.dota2.com/webapi/';

					// For some reason dota apis specifically want zero padded versions
					version = version.toString().padStart( 4, '0' );
				}
				else if( method._type === 'publisher_only' )
				{
					host = 'https://partner.steam-api.com/';
				}

				return `${host}${this.currentInterface}/${methodName}/v${version}/`;
			},
			renderParameters( method )
			{
				const parameters = new URLSearchParams();

				if( this.userData.webapi_key && method._type !== 'dota2' )
				{
					parameters.set( 'key', this.userData.webapi_key );
				}

				if( this.userData.format !== 'json' )
				{
					parameters.set( 'format', this.userData.format );
				}

				if( method.parameters )
				{
					for( const parameter of method.parameters )
					{
						if( !parameter._value )
						{
							continue;
						}

						parameters.set( parameter.name, parameter.type === 'bool' ? 1 : parameter._value );
					}
				}

				return '?' + parameters.toString();
			},
			useThisMethod( event, method )
			{
				if( method.httpmethod === 'POST' && !confirm(
					'Executing POST requests could be potentially disastrous.\n\n'
					+ 'Author is not responsible for any damage done.\n\n'
					+ 'Are you sure you want to continue?'
				) )
				{
					event.preventDefault();
				}

				for( const field of event.target.elements )
				{
					if( !field.value && !field.disabled && field.tagName === "INPUT" )
					{
						field.disabled = true;

						setTimeout( () => field.disabled = false, 0 );
					}
				}
			},
			setMethod( interfaceName, methodName )
			{
				this.skipInterfaceSet = true;
				this.currentInterface = interfaceName;

				if( methodName )
				{
					this.$nextTick( () =>
					{
						const element = document.getElementById( methodName );

						if( element )
						{
							element.scrollIntoView();
						}
					} );
				}
			},
			copyUrl( event )
			{
				const element = event.target.closest( '.input-group' ).querySelector( '.form-control' );
				const selection = window.getSelection();
				const range = document.createRange();
				range.selectNodeContents( element );
				selection.removeAllRanges();
				selection.addRange( range );
				document.execCommand( 'copy' );
			},
			updateUrl( method )
			{
				history.replaceState( '', '', '#' + this.currentInterface + '/' + method );
			},
			navigateSidebar( direction )
			{
				const keys = Object.keys( this.filteredInterfaces );

				const size = keys.length;
				index = keys.indexOf( this.currentInterface ) + direction;

				this.currentInterface = keys[ ( ( index % size ) + size ) % size ];
			},
		},
	});

	fillSteamidParameter();
	setInterface();
	window.addEventListener( 'hashchange', setInterface, false );

	if( 'serviceWorker' in navigator )
	{
		navigator.serviceWorker.register( 'serviceworker.js', { scope: './' } );
	}

	function setInterface()
	{
		let currentInterface = location.hash;
		let currentMethod = '';

		if( currentInterface[ 0 ] === '#' )
		{
			const split = currentInterface.substring( 1 ).split( '/', 2 );
			currentInterface = split[ 0 ];

			if( split[ 1 ] )
			{
				currentMethod = split[ 1 ];
			}
		}

		if( !interfaces.hasOwnProperty( currentInterface ) )
		{
			currentInterface = '';
			currentMethod = '';
		}
		else if( !interfaces[ currentInterface ].hasOwnProperty( currentMethod ) )
		{
			currentMethod = '';
		}

		app.setMethod( currentInterface, currentMethod );
	}

	function fillSteamidParameter()
	{
		for( const interfaceName in interfaces )
		{
			for( const methodName in interfaces[ interfaceName ] )
			{
				if( interfaces[ interfaceName ][ methodName ].parameters )
				{
					for( const parameter of interfaces[ interfaceName ][ methodName ].parameters )
					{
						if( !parameter._value && parameter.name.includes( 'steamid' ) )
						{
							parameter._value = app.userData.steamid;
						}
					}
				}
			}
		}
	}
})();
