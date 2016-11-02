export const ASSIGN_NEXT_CHAT = 'ASSIGN_NEXT_CHAT'
export const ASSIGN_CHAT = 'ASSIGN_CHAT'
export const CLOSE_CHAT = 'CLOSE_CHAT'
export const INSERT_PENDING_CHAT = 'INSERT_PENDING_CHAT'
export const REASSIGN_CHATS = 'REASSIGN_CHATS'
export const RECEIVE_CUSTOMER_MESSAGE = 'RECEIVE_CUSTOMER_MESSAGE'
export const RECOVER_CHATS = 'RECOVER_CHATS'
export const SET_CHAT_MISSED = 'SET_CHAT_MISSED'
export const SET_CHAT_OPERATOR = 'SET_CHAT_OPERATOR'
export const SET_CHAT_STATUS = 'SET_CHAT_STATUS'
export const SET_CHATS_ABANDONED = 'SET_CHATS_ABANDONED'
export const SET_CHATS_RECOVERED = 'SET_CHATS_RECOVERED'
export const SET_OPERATOR_CHATS_ABANDONED = 'SET_OPERATOR_CHATS_ABANDONED'
export const TRANSFER_CHAT = 'TRANSFER_CHAT'

export const receiveCustomerMessage = ( chat, message ) => ( {
	type: RECEIVE_CUSTOMER_MESSAGE, chat, message
} )

export const reassignChats = ( operator, socket ) => ( {
	type: REASSIGN_CHATS, operator, socket
} )

export const setChatsAbandoned = ( chat_ids ) => ( {
	type: SET_CHATS_ABANDONED, chat_ids
} )

export const setOperatorChatsAbandoned = ( operator_id ) => ( {
	type: SET_OPERATOR_CHATS_ABANDONED, operator_id
} )

export const recoverChats = ( operator, socket ) => ( {
	type: RECOVER_CHATS, operator, socket
} )

export const insertPendingChat = chat => ( {
	type: INSERT_PENDING_CHAT, chat
} )

export const closeChat = ( chat_id, operator ) => ( {
	type: CLOSE_CHAT, chat_id, operator
} )

export const setChatStatus = ( chat, status ) => ( {
	type: SET_CHAT_STATUS, chat, status
} )

export const setChatMissed = ( chat_id, error ) => ( {
	type: SET_CHAT_MISSED, chat_id, error
} )

export const setChatOperator = ( chat_id, operator ) => ( {
	type: SET_CHAT_OPERATOR, chat_id, operator
} )

export const transferChat = ( chat_id, from, to ) => ( {
	type: TRANSFER_CHAT, chat_id, from, to
} )

export const setChatsRecovered = ( chat_ids ) => ( {
	type: SET_CHATS_RECOVERED, chat_ids
} )

export const assignNextChat = () => ( {
	type: ASSIGN_NEXT_CHAT
} )

export const assignChat = chat => ( {
	type: ASSIGN_CHAT, chat
} )
