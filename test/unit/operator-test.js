import { EventEmitter } from 'events'
import { ok, equal, deepEqual, doesNotThrow } from 'assert'
import operator from 'operator'
import mockio from '../mock-io'
import { tick } from '../tick'
import { parallel } from 'async'
import map from 'lodash/map'
import includes from 'lodash/includes'
import reduce from 'lodash/reduce'
import createStore from 'store'
import WatchingMiddleware from '../mock-middleware'
import {
	operatorReceive,
	operatorChatClose,
	setAcceptsCustomers,
	operatorTransfer,
	operatorRecover,
	operatorOpen,
	operatorAssign
} from 'operator/actions'
import { selectTotalCapacity } from 'operator/store'
import { STATUS_AVAILABLE } from 'operator'

const debug = require( 'debug' )( 'happychat:test:operators' )

describe( 'Operators', () => {
	let operators
	let socketid = 'socket-id'
	let user
	let socket, client, server, events, store, io, watchingMiddleware

	const connectOperator = ( { socket: useSocket, client: useClient }, authUser = { id: 'user-id', displayName: 'name' } ) => new Promise( ( resolve ) => {
		useClient
		.once( 'identify', ( identify ) => identify( null, authUser ) )
		.once( 'init', ( clientUser ) => {
			resolve( { user: clientUser, client: useClient, socket: useSocket } )
		} )
		server.connect( useSocket )
	} )

	beforeEach( () => {
		events = new EventEmitter();
		( { server: io } = mockio( socketid ) )
		server = io.of( '/operator' );
		( { socket, client } = server.newClient( socketid ) )
		watchingMiddleware = new WatchingMiddleware()

		// Need to add a real socket io middleware here
		store = createStore( { io, operators: events, customers: new EventEmitter(), chatlist: new EventEmitter(), middlewares: [ watchingMiddleware.middleware() ] } )
		operators = operator( server, events, store )
		operators.on( 'connection', ( s, callback ) => s.emit( 'identify', callback ) )
	} )

	describe( 'when authenticated and online', () => {
		let op = { id: 'user-id', displayName: 'furiosa', avatarURL: 'url', priv: 'var', status: 'online', load: 1, capacity: 3 }
		beforeEach( ( done ) => {
			connectOperator( { socket, client }, op )
			.then( ( { user: operatorUser } ) => {
				user = operatorUser
				done()
			} )
		} )

		it( 'should send current state to operator', done => {
			client.on( 'broadcast.state', ( version, state ) => {
				ok( version )
				deepEqual( state, store.getState() )
				done()
			} )
		} )

		it( 'should recover chats for an operator', ( done ) => {
			// operators.emit( 'recover', { user: op }, [ { id: 'something' } ], tick( () => {
			// 	equal( operators.io.rooms['customers/something'].length, 1 )
			// 	done()
			// } ) )
			store.dispatch( operatorRecover( { user: op }, [ { id: 'something' } ], tick( () => {
				equal( operators.io.rooms['customers/something'].length, 1 )
				done()
			} ) ) );
		} )

		it( 'should emit disconnect event when last operator socket disconnects', ( done ) => {
			operators.on( 'disconnect', tick( ( { id } ) => {
				equal( id, op.id )
				done()
			} ) )
			server.disconnect( { socket, client } )
		} )

		it( 'should emit message', ( done ) => {
			operators.on( 'message', ( { id: chat_id }, { id, displayName, avatarURL, priv }, { text, user: author } ) => {
				ok( id )
				ok( displayName )
				ok( avatarURL )
				ok( priv )
				ok( ! author.priv )
				equal( chat_id, 'chat-id' )
				equal( text, 'message' )
				done()
			} )
			client.emit( 'message', 'chat-id', { id: 'message-id', text: 'message' } )
		} )

		it( 'should handle `chat.typing` from client and pass to events', ( done ) => {
			operators.on( 'typing', ( chat, typingUser, text ) => {
				equal( chat.id, 'chat-id' )
				equal( typingUser.id, op.id )
				equal( text, 'typing a message...' )
				done()
			} )

			client.emit( 'chat.typing', 'chat-id', 'typing a message...' );
		} )

		it( 'should emit when user wants to join a chat', ( done ) => {
			operators.on( 'chat.join', ( chat_id, clientUser ) => {
				equal( chat_id, 'chat-id' )
				deepEqual( clientUser, user )
				done()
			} )
			client.emit( 'chat.join', 'chat-id' )
		} )

		it( 'should not throw when callback runs twice', done => {
			// chat room operator
			client.removeAllListeners( 'identify' )
			client.on( 'identify', tick( ( identify ) => {
				doesNotThrow( () => {
					identify( { id: 'user-id', displayName: 'fred' } )
					identify( { id: 'user-id', displayName: 'sam' } )
					done()
				} )
			} ) )

			// operators.emit( 'open', { id: 'chat-id' }, 'customers/chat-id', { id: 'user-id' } )
			store.dispatch( operatorOpen( { id: 'chat-id' }, 'customers/chat-id', { id: 'user-id' } ) );
		} )

		it( 'should fail to remote dispatch', done => {
			client.once( 'broadcast.state', () => {
				client.emit( 'broadcast.dispatch', { type: 'UNKNOWN' }, ( error ) => {
					equal( error, 'Remote dispatch not allowed' )
					done()
				} )
			} )
		} )

		it( 'should allow remote dispatch', done => {
			client.once( 'broadcast.state', () => {
				client.emit( 'broadcast.dispatch', setAcceptsCustomers( true ), ( error ) => {
					equal( error, null )
					ok( store.getState().operators.system.acceptsCustomers )
					done()
				} )
			} )
		} )

		it( 'should emit when user wants to leave a chat', ( done ) => {
			operators.on( 'chat.leave', ( chat_id, clientUser ) => {
				equal( chat_id, 'chat-id' )
				deepEqual( clientUser, user )
				done()
			} )
			client.emit( 'chat.leave', 'chat-id' )
		} )

		it( 'should assign an operator to a new chat', ( done ) => {
			// set up a second client
			const connection = server.newClient()
			const { client: clientb } = connection
			connectOperator( connection, user )
			.then( ( userb ) => {
				let a_open = false, b_open = false;
				client.on( 'chat.open', () => {
					a_open = true
				} )
				clientb.on( 'chat.open', () => {
					b_open = true
				} )

				client.on( 'available', ( chat, callback ) => {
					equal( chat.id, 'chat-id' )
					callback( { load: 0, status: 'available', capacity: 6, id: user.id } )
				} )
				clientb.on( 'available', ( chat, callback ) => {
					callback( { load: 0, status: 'available', capacity: 5, id: userb.id } )
				} )

				// operators.emit( 'assign', { id: 'chat-id' }, 'customer/room-name', ( error, assigned ) => {
				// 	ok( ! error )
				// 	ok( a_open )
				// 	ok( b_open )
				// 	equal( assigned.id, 'user-id' )
				// 	ok( includes( socket.rooms, 'customer/room-name' ) )
				// 	done()
				// } )
				store.dispatch( operatorAssign( { id: 'chat-id' }, 'customer/room-name', ( error, assigned ) => {
					ok( ! error )
					ok( a_open )
					ok( b_open )
					equal( assigned.id, 'user-id' )
					ok( includes( socket.rooms, 'customer/room-name' ) )
					done()
				} ) )
			} )
		} )

		it( 'should not error when operator responds multiple times to available', ( done ) => {
			client.on( 'available', tick( ( chat, callback ) => {
				doesNotThrow( () => {
					callback( { load: 0, status: 'available', capacity: 6, id: user.id } )
					callback( { load: 0, status: 'available', capacity: 6, id: user.id } )
				} )
			} ) )

			// operators.emit( 'assign', { id: 'chat-id' }, 'customer/room-name', tick( ( e ) => {
			// 	done( e )
			// } ) )
			store.dispatch( operatorAssign( { id: 'chat-id' }, 'customer/room-name', tick( ( e ) => {
				done( e )
			} ) ) )
		} )

		describe( 'with assigned chat', () => {
			var chat = { id: 'chat-id' }
			beforeEach( () => new Promise( ( resolve, reject ) => {
				client.once( 'available', ( pendingChat, available ) => available( { status: 'available', load: 0, capacity: 1 } ) )
				client.once( 'chat.open', () => resolve() )
				// operators.emit( 'assign', chat, `customers/${ chat.id }`, error => {
				// 	if ( error ) return reject( error )
				// } )
				store.dispatch( operatorAssign( chat, `customers/${ chat.id }`, error => {
					if ( error ) return reject( error )
				} ) )
			} ) )

			it( 'should emit chat.close from operator connection', ( done ) => {
				operators.once( 'chat.close', ( chat_id, operatorUser ) => {
					deepEqual( user, operatorUser )
					done()
				} )
				client.emit( 'chat.close', chat.id )
			} )

			it( 'should emit transfer request', () => {
				const userb = { id: 'a-user', displayName: 'Jem', status: 'online', load: 0, capacity: 4 }
				const connectionb = server.newClient()
				return connectOperator( connectionb, userb )
				.then( () => new Promise( resolve => {
					operators.once( 'chat.transfer', ( chat_id, opUser, toUser ) => {
						equal( chat_id, chat.id )
						deepEqual( opUser, op )
						deepEqual( toUser, userb )
						resolve()
					} )
					client.emit( 'chat.transfer', chat.id, userb.id )
				} ) )
			} )

			it( 'should send message from customer', ( done ) => {
				client.once( 'chat.message', ( { id: chat_id }, message ) => {
					equal( chat_id, chat.id )
					equal( message.id, 'message-id' )
					equal( message.text, 'hola mundo' )
					done()
				} )

				store.dispatch( operatorReceive( chat.id, { id: 'message-id', text: 'hola mundo' } ) );
			} )

			describe( 'with multiple operators', () => {
				const users = [
					{ id: 'nausica', displayName: 'nausica'},
					{ id: 'ridley', displayName: 'ridley'}
				]

				const connectClients = () => Promise.all(
					users.map( u => connectOperator( server.newClient(), u ) )
				)

				it( 'should transfer to user', () => connectClients().then( connections => new Promise( resolve => {
					debug( 'fuck!' )
					debug( 'doing it!', connections )
					operators.once( 'chat.transfer', ( id, from, to ) => {
						store.dispatch( operatorTransfer( chat, from, to, () => {} ) )
						// operators.emit( 'transfer', chat, from, to, () => {} )
					} )
					connections[0].client.once( 'chat.open', ( _chat ) => {
						deepEqual( _chat, chat )
						resolve()
					} )
					client.emit( 'chat.transfer', chat.id, users[0].id )
				} ) ) )

				it( 'should transfer when assigned is missing', () => connectClients().then( connections => new Promise( resolve => {
					connections[0].client.on( 'chat.open', ( _chat ) => {
						deepEqual( _chat, chat )
						resolve()
					} )

					operators.emit( 'transfer', chat, null, { id: users[0].id }, ( e, op_id ) => {
						equal( e, null )
						equal( op_id, users[0].id )
					} )
				} ) ) )
			} )
		} )
	} )

	it( 'should send init message to events', ( done ) => {
		operators.on( 'init', ( { user: u, socket: s, room } ) => {
			ok( u )
			ok( s )
			ok( room )
			equal( room, `operators/${u.id}` )
			done()
		} )
		connectOperator( server.newClient(), { id: 'a-user' } ).catch( done )
	} )

	describe( 'with multiple connections from same operator', () => {
		let connections
		let op = { id: 'user-id', displayName: 'furiosa', avatarURL: 'url', priv: 'var' }

		const connectAllClientsToChat = ( ops, chat, opUser ) => new Promise( ( resolve, reject ) => {
			parallel( map( connections, ( { client: opClient } ) => ( callback ) => {
				opClient.once( 'chat.open', ( _chat ) => callback( null, _chat ) )
			} ), ( e, chats ) => {
				if ( e ) return reject( e )
				resolve( chats )
			} )
			// ops.emit( 'open', chat, `customers/${ chat.id }`, opUser )
			store.dispatch( operatorOpen( chat, `customers/${ chat.id }`, opUser ) );
		} )

		beforeEach( () => {
			connections = []
			return connectOperator( server.newClient(), op )
			.then( ( conn ) => {
				connections.push( conn )
				return connectOperator( server.newClient(), op )
			} )
			.then( ( conn ) => new Promise( ( resolve ) => {
				connections.push( conn )
				resolve()
			} ) )
		} )

		it( 'should not emit leave when one socket disconnects', () => {
			return new Promise( ( resolve, reject ) => {
				const [ connection ] = connections
				const { client: c, socket: s } = connection
				operators.on( 'leave', () => {
					reject( new Error( 'there are still clients connected' ) )
				} )
				c.on( 'disconnect', () => {
					resolve()
				} )
				operators.io.in( 'operators/user-id' ).clients( ( e, clients ) => {
					equal( clients.length, 2 )
					server.disconnect( { client: c, socket: s } )
				} )
			} )
		} )

		it( 'should emit chat.close to all clients in a chat', () => {
			return connectAllClientsToChat( operators, { id: 'chat-id' }, op )
			.then( () => new Promise( ( resolve, reject ) => {
				parallel( map( connections, ( { client: opClient } ) => ( callback ) => {
					opClient.once( 'chat.close', ( chat, opUser ) => callback( null, { chat, operator: opUser, client: opClient } ) )
				} ), ( e, messages ) => {
					if ( e ) reject( e )
					resolve( messages )
				} )
				store.dispatch( operatorChatClose( { id: 'chat-id' }, 'customers/chat-id', op ) )
			} ) )
			.then( ( messages ) => {
				equal( messages.length, 2 )
			} )
		} )
	} )

	describe( 'with multiple connected users', () => {
		let ops = [
			{ id: 'hermione', displayName: 'Hermione', avatarURL: 'url', status: 'available', capacity: 4, load: 1 },
			{ id: 'ripley', displayName: 'Ripley', avatarURL: 'url', status: 'available', capacity: 1, load: 1 },
			{ id: 'nausica', displayName: 'Nausica', avatarURL: 'url', status: 'available', capacity: 1, load: 0 },
			{ id: 'furiosa', displayName: 'Furiosa', avatarURL: 'url', status: 'available', capacity: 5, load: 0 },
			{ id: 'river', displayName: 'River Tam', status: 'available', capacity: 6, load: 3 },
			{ id: 'buffy', displayName: 'Buffy', status: 'offline', capacity: 20, load: 0 }
		]

		const assign = ( chat_id ) => new Promise( ( resolve, reject ) => {
			// operators.emit( 'assign', { id: chat_id }, `customer/${chat_id}`, ( error, assigned ) => {
			// 	if ( error ) {
			// 		return reject( error )
			// 	}
			// 	resolve( assigned )
			// } )
			store.dispatch( operatorAssign( { id: chat_id }, `customer/${chat_id}`, ( error, assigned ) => {
				if ( error ) {
					return reject( error )
				}
				resolve( assigned )
			} ) )
		} )

		const connectAll = () => Promise.all( ops.map(
			op => new Promise( ( resolve, reject ) => {
				const io_client = server.newClient()
				const record = { load: op.load, capacity: op.capacity, status: 'available' }
				io_client.client
				.on( 'init', () => io_client.client.emit( 'status', op.status, () => {
					resolve()
				} ) )
				.on( 'available', ( chat, callback ) => {
					callback( { load: record.load, capacity: record.capacity, id: op.id, status: op.status } )
				} )
				.on( 'chat.open', () => {
					record.load += 1
				} )
				connectOperator( io_client, op ).catch( reject )
			} )
		) )

		beforeEach( () => connectAll() )

		const collectPromises = ( ... promises ) => new Promise( ( resolve, reject ) => {
			let results = []
			reduce( promises, ( promise, nextPromise ) => {
				return promise.then( result => {
					if ( result !== undefined ) {
						results.push( result )
					}
					return nextPromise()
				} )
			}, Promise.resolve() )
			.then( result => {
				resolve( results.concat( [ result ] ) )
			}, reject );
		} )

		const assignChats = ( total = 10 ) => {
			let promises = []
			for ( let i = 0; i < total; i++ ) {
				promises.push( () => assign( 'chat-' + i ) )
			}
			return collectPromises( ... promises )
		}

		it( 'should assign operators in correct order', () => assignChats( 9 ).then( results => {
			deepEqual(
				map( results, ( { id } ) => id ),
				[
					'furiosa',  // 0/5 => 1/5
					'nausica',  // 0/1 => 1/1
					'furiosa',  // 1/5 => 2/5
					'hermione', // 1/4 => 2/4
					'furiosa',  // 2/5 => 3/5
					'river',    // 3/6 => 4/6
					'hermione', // 2/4 => 3/4
					'furiosa',  // 3/5 => 4/5
					'river',    // 4/6 => 5/6
				]
			)
		} ) )

		it( 'should report accepting customers', () => {
			const { load, capacity } = selectTotalCapacity( store.getState(), STATUS_AVAILABLE )
			ok( load < capacity )
			equal( capacity, 17 )
		} )
	} )
} )
