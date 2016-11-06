import { default as util, authenticators } from './util'
import assign from 'lodash/assign'
import reduce from 'lodash/reduce'
import concat from 'lodash/concat'
import find from 'lodash/find'
import { ok, deepEqual } from 'assert'

describe( 'Operator Transfer', () => {
	const operators = [
		{ id: 'a', status: 'available', capacity: 2, load: 0 },
		{ id: 'b', status: 'available', capacity: 1, load: 0 }
	]
	const customer = { id: 'customer-id', username: 'customer', session_id: 'customer-session' }

	const service = util( assign( authenticators( customer ), {
		operatorAuthenticator: ( socket, auth ) => socket.emit( 'auth', auth )
	} ) )
	beforeEach( () => service.start() )
	afterEach( () => service.stop() )

	const connectOperator = ( user ) => service.startOperator()
		.then( client => new Promise( resolve => {
			client.on( 'connect', () => {
				client.once( 'auth', auth => auth( null, user ) )
				client.once( 'init', () => resolve( client ) )
				client.on( 'available', ( chat, available ) => available( { capacity: user.capacity, status: 'available', load: 0 } ) )
			} )
		} ) )

	const thenConcat = arr => val => new Promise( resolve => resolve( concat( arr, val ) ) )

	const connectOperators = ( users ) => new Promise( resolve => {
		return reduce(
			users,
			( all, user ) => all.then(
				clients => connectOperator( user ).then( thenConcat( clients ) )
			),
			new Promise( start => process.nextTick( () => start( [] ) ) )
		).then( resolve )
	} )

	const connectCustomer = () => new Promise( resolve => {
		service.startCustomer().then( ( client ) => client.once( 'init', () => resolve( client ) ) )
	} );

	it( 'should log transfer between operators', () => connectOperators( operators )
		.then( ( [a, b] ) => connectCustomer().then( customerClient => {
			return Promise.resolve()
			// get chat assigned to operator a
			.then( () => new Promise( resolve => {
				a.once( 'chat.open', ( chat ) => resolve( chat ) )
				customerClient.emit( 'message', { id: 'message1', text: 'help please' } )
			} ) )
			.then( ( chat ) => new Promise( resolve => {
				// have operator a transfer to operator b
				a.emit( 'chat.transfer', chat.id, 'b' )
				b.once( 'log', ( _, log ) => resolve( log ) )
			} ) )
			.then( messages => {
				// check to make sure the transfer event message is in the log
				let transfer = find( messages, ( { type, meta } ) => type === 'event' && meta.event_type === 'transfer' )
				ok( transfer )
				const expectedTo = Object.assign( {}, operators[1], { load: 0 } )
				deepEqual( transfer.meta.from, operators[0] )
				deepEqual( transfer.meta.to, expectedTo )
			} )
		} ) )
	)
} )
