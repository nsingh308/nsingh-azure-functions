# Azure Functions App - nsingh

This project contains Azure Functions that demonstrate a queue-based message processing pipeline with Cosmos DB integration using **identity-based authentication (Managed Identity)** and Azure SDKs. No connection strings or access keys are stored in code or configuration.

## Project Structure

```
nsingh/
├── NodeHttpTriggerFunction/     # HTTP trigger that sends messages to queue
│   ├── function.json
│   └── handler.js
├── QueueToCosmosFunction/       # Timer trigger that polls queue and writes to Cosmos DB
│   ├── function.json
│   └── handler.js
├── host.json
├── local.settings.json
├── package.json
└── README.md
```

## Functions Overview

### 1. NodeHttpTriggerFunction (HTTP Trigger)

**Trigger**: HTTP (GET/POST)  
**Output**: Azure Storage Queue (`messages`) via SDK

Accepts a name via query string or request body, creates a JSON message, and sends it to Azure Storage Queue using the `@azure/storage-queue` SDK with Managed Identity authentication.

**Endpoint**: `/api/NodeHttpTriggerFunction`

**Example Request**:
```bash
curl "https://nsingh.azurewebsites.net/api/NodeHttpTriggerFunction?code=YOUR_FUNCTION_KEY&name=Alice"
```

**Example Response**:
```json
{
  "message": "Hello, Alice!",
  "queueMessage": "Message sent to queue successfully",
  "cleanedName": "Alice"
}
```

**Queue Message Format**:
```json
{
  "name": "Alice",
  "timestamp": "2025-12-15T11:22:53.342Z",
  "message": "Hello, Alice!"
}
```

### 2. QueueToCosmosFunction (Timer Trigger)

**Trigger**: Timer (every minute)  
**Input**: Azure Storage Queue (`messages`) via SDK  
**Output**: Cosmos DB (`nsingh-db` database, `products` container) via SDK

Runs every minute, polls the Azure Storage Queue for messages, and writes them to Cosmos DB. Uses `@azure/storage-queue` and `@azure/cosmos` SDKs with Managed Identity authentication. Automatically deletes processed messages from the queue.

**Document Structure**:
```json
{
  "id": "1765797793328-2723zhk4a",
  "productId": "Alice",
  "name": "Alice",
  "message": "Hello, Alice!",
  "processedAt": "2025-12-15T11:23:13.328Z"
}
```

## Prerequisites

- Node.js 18+ or 22+
- Azure Functions Core Tools v4
- Azure subscription
- Azure CLI (for deployment and resource creation)

## Azure Resources Setup

Before deploying the functions, create the required Azure resources:

### 1. Create Resource Group

```bash
az group create --name nsingh_group --location centralindia
```

### 2. Create Storage Account

```bash
az storage account create \
  --name nsinghstorage \
  --resource-group nsingh_group \
  --location centralindia \
  --sku Standard_LRS
```

### 3. Create Queue

```bash
az storage queue create \
  --name messages \
  --account-name nsinghstorage \
  --auth-mode login
```

### 4. Create Cosmos DB Account (NoSQL API)

```bash
az cosmosdb create \
  --name nsingh-dev \
  --resource-group nsingh_group \
  --locations regionName=centralindia
```

### 5. Create Cosmos DB Database

```bash
az cosmosdb sql database create \
  --account-name nsingh-dev \
  --resource-group nsingh_group \
  --name nsingh-db
```

### 6. Create Cosmos DB Container

```bash
az cosmosdb sql container create \
  --account-name nsingh-dev \
  --resource-group nsingh_group \
  --database-name nsingh-db \
  --name products \
  --partition-key-path "/productId"
```

### 7. Create Function App

```bash
az functionapp create \
  --name nsingh \
  --resource-group nsingh_group \
  --consumption-plan-location centralindia \
  --runtime node \
  --runtime-version 22 \
  --functions-version 4 \
  --os-type Linux
```

## Configuration

### Local Development

Update `local.settings.json`:

```json
{
  "IsEncrypted": false,
  "Values": {__serviceUri": "https://nsinghstorage.blob.core.windows.net",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "CosmosDbEndpoint": "https://nsingh-dev.documents.azure.com",
    "CosmosDbDatabaseName": "nsingh-db",
    "CosmosDbContainerName": "products"
  }
}
```

**Note**: For local development, authenticate with Azure CLI (`az login`) so `DefaultAzureCredential` can access Azure resources using your local credentials.

### Azure Configuration

Required Application Settings in Azure Function App:

| Setting Name | Description | Example |
|-------------|-------------|---------|
| `AzureWebJobsStorage__serviceUri` | Storage blob service URI for runtime | `https://nsinghstorage.blob.core.windows.net` |
| `CosmosDbEndpoint` | Cosmos DB endpoint URL | `https://nsingh-dev.documents.azure.com` |
| `CosmosDbDatabaseName` | Cosmos DB database name | `nsingh-db` |
| `CosmosDbContainerName` | Cosmos DB container name | `products` |
| `FUNCTIONS_WORKER_RUNTIME` | Worker runtime | `node` |
| `FUNCTIONS_EXTENSION_VERSION` | Functions runtime version | `~4` |

### RBAC Setup

The Function App uses **System-assigned Managed Identity** to authenticate to both Azure Storage and Cosmos DB. No connection strings or access keys required!

#### 1. Enable Managed Identity

```bash
az functionapp identity assign \
  --name nsingh \
  --resource-group nsingh_group
```

#### 2. Assign Storage Roles

```bash
# Get Managed Identity Principal ID
PRINCIPAL_ID=$(az functionapp identity show \
  --name nsingh \
  --resource-group nsingh_group \
  --query principalId -o tsv)

# Get Storage Account Resource ID
STORAGE_ID=$(az storage account show \
  --name nsinghstorage \
  --resource-group nsingh_group \
  --query id -o tsv)

# Assign required storage roles
az role assignment create \
  --role "Storage Blob Data Owner" \
  --assignee $PRINCIPAL_ID \
  --scope $STORAGE_ID

az role assignment create \
  --role "Storage Queue Data Contributor" \
  --assignee $PRINCIPAL_ID \
  --scope $STORAGE_ID

az role assignment create \
  --role "Storage Table Data Contributor" \
  --assignee $PRINCIPAL_ID \
  --scope $STORAGE_ID
```

#### 3. Assign Cosmos DB Role

```bash
az cosmosdb sql role assignment create \
  --account-name nsingh-dev \
  --resource-group nsingh_group \
  --role-definition-name "Cosmos DB Built-in Data Contributor" \
  --principal-id $PRINCIPAL_ \
  --principal-id YOUR-FUNCTION-APP-MANAGED-IDENTITY-PRINCIPAL-ID \
  --screquired application settings
az functionapp config appsettings set \
  --name nsingh \
  --resource-group nsingh_group \
  --settings \
    "AzureWebJobsStorage__serviceUri=https://nsinghstorage.blob.core.windows.net" \
    "CosmosDbEndpoint=https://nsingh-dev.documents.azure.com" \
    "CosmosDbDatabaseName=nsingh-db" \
    "CosmosDbContainerName=products"

# Restart function app after configuration changes
az functionapp restart --name nsingh --resource-group nsingh_group
## Local Development

Start the Functions host locally:

```bash
func start
```

The functions will be available at:
- **NodeHttpTriggerFunction**: `http://localhost:7071/api/NodeHttpTriggerFunction`
- **QueueToCosmosFunction**: Triggers automatically when messages appear in the queue

Test locally:

```bash
# Send a message to the queue
curl "http://localhost:7071/api/NodeHttpTriggerFunction?name=TestUser"

# Check logs to see QueueToCosmosFunction processing
```

## Deployment

Deploy to Azure:

```bash
func azure functionapp publish nsingh
```

Set Azure configuration (if not already set):

```bash
# Set Cosmos DB endpoint
az functionapp config appsettings set \
  --name nsingh \
  --resource-group YOUR-RESOURCE-GROUP \
  --settings "CosmosDbEndpoint=https://nsingh-dev.documents.azure.com"
 (SDK)
                      ↓
              Azure Storage Queue (messages)
                      ↓
            QueueToCosmosFunction (Timer: every 1 min)
                      ↓ (SDK polls queue)
              Cosmos DB (nsingh-db/products)
```

1. User sends HTTP request with a name parameter
2. `NodeHttpTriggerFunction` uses Storage Queue SDK to send message with Managed Identity
3. Message is stored in `messages` queue
4. `QueueToCosmosFunction` runs every minute via timer trigger
5. Function uses Storage Queue SDK to poll and receive messages (up to 32 at a time)
6. For each message, function uses Cosmos DB SDK to create document
7. Successfully processed messages are deleted from queue
8. Cosmos DB stores the document with `productId` as partition key

**Authentication Flow**:
- All SDK calls use `DefaultAzureCredential`
- In Azure: Uses Function App's System-assigned Managed Identity
- Locally: Uses Azure CLI credentials (`az login`)
- No connection strings or keys required
curl "https://nsingh.azurewebsites.net/api/NodeHttpTriggerFunction?code=YOUR_FUNCTION_KEY&name=Alice"

# Using POST
curl -X POST https://nsingh.azurewebsites.net/api/NodeHttpTriggerFunction?code=YOUR_FUNCTION_KEY \
  -H "Content-Type: application/json" \
  -d '{"name":"Bob"}'
```

### Verify Queue Message

Check Azure Portal → Storage Account → Queues → `messages`

### Verify Cosmos DB Write

Check Azure Portal → Cosmos DB → Data Explorer → `test` database → `products` container

Or query using Azure CLI:

```bash
az cosmosdb sql container query \
  --account-name YOUR-COSMOSDB-ACCOUNT \
  --resource-group YOUR-RESOURCE-GROUP \
  -Key Features

- ✅ **Identity-Based Authentication**: Uses Managed Identity for all Azure services
- ✅ **No Secrets in Code**: No connection strings or access keys stored anywhere
- ✅ **SDK-Based Approach**: Direct control over Azure Storage Queue and Cosmos DB operations
- ✅ **RBAC Security**: Fine-grained access control with Azure role assignments
- ✅ **Automatic Message Cleanup**: Processed messages are automatically deleted from queue

## Dependencies

- `@azure/cosmos`: ^4.0.0 - Cosmos DB SDK
- `@azure/storage-queue`: ^12.0.0 - Azure Storage Queue SDK
- `@azure/identity`: ^4.0.0 - Azure authentication with DefaultAzureCredential

## Architecture Flow

```
HTTP Request → NodeHttpTriggerFunction
  Timer runs every minute - check execution logs
- Verify Managed Identity has `Storage Queue Data Contributor` role
- Ensure queue name `messages` exists in storage account

### Cosmos DB authentication errors

- Verify Managed Identity is enabled on Function App
- Check RBAC role assignment: `Cosmos DB Built-in Data Contributor`
- Ensure `CosmosDbEndpoint` is correct (no trailing slash)
- Wait 5-10 minutes after role assignment for propagation

### Storage authentication errors

- Verify all three storage roles are assigned: Blob Data Owner, Queue Data Contributor, Table Data Contributor
- Check `AzureWebJobsStorage__serviceUri` is set correctly
- Ensure storage account allows public network access or Function App is in same VNet

### Local development issues

- Run `az login` before testing locally
- Verify your Azure account has required permissions on storage and Cosmos DB
- Check that `DefaultAzureCredential` can authenticate (no proxy/firewall blocking)
- For troubleshooting, add logging: `context.log('Credential info:', credential)`

### Function deployment issues

- If deployment fails with storage error, ensure `AzureWebJobsStorage__serviceUri` is set
- Runtime requires blob storage for internal state management
- Verify Function App has network access to storage account
## Troubleshooting

### Queue messages not processing

- Check Function App logs in Azure Portal
- Verify queue polling is enabled in `host.json`
- Ensure the queue name matches in both functions

### Cosmos DB authentication errors

- Verify Managed Identity is enabled
- Check RBAC role assignment
- Ensure `CosmosDbEndpoint` is correct (no trailing slash or port)

### Local development issues

- For local testing, you may need to use Azure CLI login: `az login`
- DefaultAzureCredential will use your local Azure credentials
- Alternatively, temporarily use a connection string for local dev

## Dependencies

- `@azure/cosmos`: ^4.0.0 - Cosmos DB SDK
- `@azure/identity`: ^4.0.0 - Azure authentication
- `lodash`: ^4.17.21

## License

MIT
