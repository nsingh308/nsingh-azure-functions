const { CosmosClient } = require('@azure/cosmos');
const { QueueClient } = require('@azure/storage-queue');
const { DefaultAzureCredential } = require('@azure/identity');

module.exports = async function (context, myTimer) {
    context.log('Timer trigger checking for queue messages');

    try {
        // Connect to queue using SDK with Managed Identity
        const queueUrl = `https://nsinghstorage.queue.core.windows.net/messages`;
        const credential = new DefaultAzureCredential();
        const queueClient = new QueueClient(queueUrl, credential);
        
        // Receive messages from queue
        const messages = await queueClient.receiveMessages({ numberOfMessages: 32 });
        
        if (messages.receivedMessageItems.length === 0) {
            context.log('No messages in queue');
            return;
        }
        
        // Create Cosmos DB client
        const endpoint = process.env.CosmosDbEndpoint;
        const databaseName = process.env.CosmosDbDatabaseName;
        const containerName = process.env.CosmosDbContainerName;
        
        const cosmosClient = new CosmosClient({ endpoint, aadCredentials: credential });
        const database = cosmosClient.database(databaseName);
        const container = database.container(containerName);
        
        // Process each message
        for (const message of messages.receivedMessageItems) {
            try {
                // Decode and parse message
                const messageText = Buffer.from(message.messageText, 'base64').toString('utf-8');
                const messageData = JSON.parse(messageText);
                
                context.log('Processing message:', messageData);
                
                // Create document for Cosmos DB
                const cosmosDocument = {
                    id: new Date().getTime().toString() + '-' + Math.random().toString(36).substr(2, 9),
                    productId: messageData.name || 'unknown',
                    name: messageData.name,
                    message: messageData.message,
                    timestamp: messageData.timestamp,
                    processedAt: new Date().toISOString()
                };
                
                // Write to Cosmos DB
                await container.items.create(cosmosDocument);
                context.log('Document written to Cosmos DB:', cosmosDocument.id);
                
                // Delete message from queue
                await queueClient.deleteMessage(message.messageId, message.popReceipt);
                context.log('Message deleted from queue');
                
            } catch (error) {
                context.log.error('Error processing message:', error.message);
                // Message will be reprocessed after visibility timeout
            }
        }
        
    } catch (error) {
        context.log.error('Error in timer function:', error.message);
        context.log.error('Error stack:', error.stack);
    }
};
