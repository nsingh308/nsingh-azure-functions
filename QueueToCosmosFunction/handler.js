module.exports = async function (context, myTimer) {
    context.log('=== HANDLER FUNCTION ENTERED ===');
    context.log('=== Timer trigger function started ===');
    context.log('Function execution time:', new Date().toISOString());
    
    // Test basic functionality first
    try {
        context.log('Loading @azure/cosmos...');
        const { CosmosClient } = require('@azure/cosmos');
        context.log('✓ @azure/cosmos loaded');
        
        context.log('Loading @azure/storage-queue...');
        const { QueueClient } = require('@azure/storage-queue');
        context.log('✓ @azure/storage-queue loaded');
        
        context.log('Loading @azure/identity...');
        const { DefaultAzureCredential } = require('@azure/identity');
        context.log('✓ @azure/identity loaded');

        
        // Log environment variables
        context.log('Reading environment variables...');
        const storageAccountName = process.env.StorageAccountName;
        const queueName = process.env.QueueName;
        context.log(`StorageAccountName: ${storageAccountName}`);
        context.log(`QueueName: ${queueName}`);
        
        if (!storageAccountName || !queueName) {
            throw new Error('Missing required environment variables: StorageAccountName or QueueName');
        }
        
        // Create credential
        context.log('Creating DefaultAzureCredential...');
        const credential = new DefaultAzureCredential();
        context.log('DefaultAzureCredential created successfully');
        
        // Connect to queue
        const queueUrl = `https://${storageAccountName}.queue.core.windows.net/${queueName}`;
        context.log(`Queue URL: ${queueUrl}`);
        context.log('Creating QueueClient...');
        const queueClient = new QueueClient(queueUrl, credential);
        context.log('QueueClient created successfully');
        
        // Receive messages from queue
        context.log('Attempting to receive messages from queue...');
        const messages = await queueClient.receiveMessages({ numberOfMessages: 32 });
        context.log(`Successfully received ${messages.receivedMessageItems.length} messages from queue`);
        
        if (messages.receivedMessageItems.length === 0) {
            context.log('No messages in queue - exiting');
            return;
        }
        
        // Read Cosmos DB configuration
        context.log('Reading Cosmos DB environment variables...');
        const endpoint = process.env.CosmosDbEndpoint;
        const databaseName = process.env.CosmosDbDatabaseName;
        const containerName = process.env.CosmosDbContainerName;
        context.log(`CosmosDbEndpoint: ${endpoint}`);
        context.log(`CosmosDbDatabaseName: ${databaseName}`);
        context.log(`CosmosDbContainerName: ${containerName}`);
        
        if (!endpoint || !databaseName || !containerName) {
            throw new Error('Missing required Cosmos DB environment variables');
        }
        
        // Create Cosmos DB client
        context.log('Creating CosmosClient...');
        const cosmosClient = new CosmosClient({ endpoint, aadCredentials: credential });
        context.log('CosmosClient created successfully');
        
        context.log('Getting database and container references...');
        const database = cosmosClient.database(databaseName);
        const container = database.container(containerName);
        context.log('Cosmos DB references obtained successfully');
        
        // Process each message
        context.log(`Starting to process ${messages.receivedMessageItems.length} messages...`);
        let successCount = 0;
        let errorCount = 0;
        
        for (let i = 0; i < messages.receivedMessageItems.length; i++) {
            const message = messages.receivedMessageItems[i];
            context.log(`\n--- Processing message ${i + 1}/${messages.receivedMessageItems.length} ---`);
            
            try {
                // Decode and parse message
                context.log(`Message ID: ${message.messageId}`);
                context.log('Decoding message from Base64...');
                const messageText = Buffer.from(message.messageText, 'base64').toString('utf-8');
                context.log(`Decoded message text: ${messageText}`);
                
                context.log('Parsing message JSON...');
                const messageData = JSON.parse(messageText);
                context.log('Parsed message data:', JSON.stringify(messageData));
                
                // Create document for Cosmos DB
                const cosmosDocument = {
                    id: new Date().getTime().toString() + '-' + Math.random().toString(36).substr(2, 9),
                    productId: messageData.name || 'unknown',
                    name: messageData.name,
                    message: messageData.message,
                    timestamp: messageData.timestamp,
                    processedAt: new Date().toISOString()
                };
                context.log('Created Cosmos document:', JSON.stringify(cosmosDocument));
                
                // Write to Cosmos DB
                context.log('Writing document to Cosmos DB...');
                await container.items.create(cosmosDocument);
                context.log(`✓ Document written to Cosmos DB successfully: ${cosmosDocument.id}`);
                
                // Delete message from queue
                context.log('Deleting message from queue...');
                await queueClient.deleteMessage(message.messageId, message.popReceipt);
                context.log('✓ Message deleted from queue successfully');
                
                successCount++;
                
            } catch (error) {
                errorCount++;
                context.log.error(`✗ Error processing message ${i + 1}:`, error.message);
                context.log.error('Error stack:', error.stack);
                // Message will be reprocessed after visibility timeout
            }
        }
        
        context.log(`\n=== Processing complete: ${successCount} successful, ${errorCount} failed ===`);
        
    } catch (error) {
        context.log.error('\n=== CRITICAL ERROR IN TIMER FUNCTION ===');
        context.log.error('Error type:', error.constructor.name);
        context.log.error('Error message:', error.message);
        context.log.error('Error code:', error.code);
        context.log.error('Error statusCode:', error.statusCode);
        context.log.error('Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        context.log.error('Error stack:', error.stack);
        context.log.error('=== END ERROR ===\n');
        throw error; // Re-throw to see in invocation logs
    }
    
    context.log('=== Timer trigger function completed successfully ===');
};
