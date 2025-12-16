const { QueueClient } = require('@azure/storage-queue');
const { DefaultAzureCredential } = require('@azure/identity');

module.exports = async function (context, req) {
    context.log('JavaScript HTTP trigger function processed a request.');
    
    // Get name and ensure it's a clean string (strip any extra quotes)
    let name = req.query.name || (req.body && req.body.name);
    
    if (name) {
        // Remove any surrounding quotes that might come from the request
        name = String(name).replace(/^["']|["']$/g, '').trim();
        
        try {
            // Create message object to send to queue
            const queueMessage = {
                name: name,
                timestamp: new Date().toISOString(),
                message: `Hello, ${name}!`
            };
            
            // Send message to queue using SDK with Managed Identity
            const queueUrl = `https://nsinghstorage.queue.core.windows.net/messages`;
            const credential = new DefaultAzureCredential();
            const queueClient = new QueueClient(queueUrl, credential);
            
            await queueClient.sendMessage(Buffer.from(JSON.stringify(queueMessage)).toString('base64'));
            context.log('Message sent to queue:', queueMessage);
            
            context.res = {
                status: 200,
                body: {
                    message: `Hello, ${name}!`,
                    queueMessage: 'Message sent to queue successfully',
                    cleanedName: name
                }
            };
        } catch (error) {
            context.log.error('Error sending message to queue:', error.message);
            context.res = {
                status: 500,
                body: `Error sending message to queue: ${error.message}`
            };
        }
    } else {
        context.res = {
            status: 400,
            body: "Please pass a name on the query string or in the request body"
        };
    }
};
