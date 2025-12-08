#!/usr/bin/env pwsh
# Tenant Provisioning Script for Kubernetes
# Automates creation of isolated tenant namespaces

param(
    [Parameter(Mandatory=$true)]
    [string]$TenantId,
    
    [Parameter(Mandatory=$true)]
    [string]$SupabaseUrl,
    
    [Parameter(Mandatory=$true)]
    [string]$SupabaseServiceRoleKey,
    
    [Parameter(Mandatory=$true)]
    [string]$OpenAIApiKey,
    
    [Parameter(Mandatory=$true)]
    [string]$GroqApiKey,
    
    [Parameter(Mandatory=$false)]
    [string]$KubeContext = "default"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "BiTB RAG Chatbot - Tenant Provisioning" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Validate tenant ID format
if ($TenantId -notmatch '^tn_[a-f0-9]{32}$') {
    Write-Host "ERROR: Invalid tenant_id format. Expected: tn_[32 hex chars]" -ForegroundColor Red
    exit 1
}

Write-Host "Tenant ID: $TenantId" -ForegroundColor Green
Write-Host "Kube Context: $KubeContext" -ForegroundColor Green
Write-Host ""

# Set kubectl context
Write-Host "[1/6] Setting kubectl context..." -ForegroundColor Yellow
kubectl config use-context $KubeContext
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to set kubectl context" -ForegroundColor Red
    exit 1
}

# Create namespace
Write-Host "[2/6] Creating tenant namespace..." -ForegroundColor Yellow
$namespace = "bitb-tenant-$TenantId"
kubectl create namespace $namespace --dry-run=client -o yaml | kubectl apply -f -
kubectl label namespace $namespace tenant_id=$TenantId isolation_level=dedicated compliance=iso-27001 app=bitb-rag-chatbot --overwrite

# Create secrets
Write-Host "[3/6] Creating tenant secrets..." -ForegroundColor Yellow
kubectl create secret generic tenant-secrets `
    --namespace=$namespace `
    --from-literal=TENANT_ID=$TenantId `
    --from-literal=SUPABASE_URL=$SupabaseUrl `
    --from-literal=SUPABASE_SERVICE_ROLE_KEY=$SupabaseServiceRoleKey `
    --from-literal=OPENAI_API_KEY=$OpenAIApiKey `
    --from-literal=GROQ_API_KEY=$GroqApiKey `
    --from-literal=REDIS_URL="redis://redis-$TenantId.$namespace.svc.cluster.local:6379" `
    --dry-run=client -o yaml | kubectl apply -f -

# Deploy tenant resources from template
Write-Host "[4/6] Deploying tenant resources..." -ForegroundColor Yellow
$template = Get-Content "k8s/tenant-namespace-template.yaml" -Raw
$manifest = $template.Replace("{{ TENANT_ID }}", $TenantId).Replace("{{ SUPABASE_URL }}", $SupabaseUrl).Replace("{{ SUPABASE_SERVICE_ROLE_KEY }}", $SupabaseServiceRoleKey).Replace("{{ OPENAI_API_KEY }}", $OpenAIApiKey).Replace("{{ GROQ_API_KEY }}", $GroqApiKey)

$manifest | kubectl apply -f -

# Wait for pods to be ready
Write-Host "[5/6] Waiting for pods to be ready..." -ForegroundColor Yellow
kubectl wait --namespace=$namespace `
    --for=condition=ready pod `
    --selector=tenant_id=$TenantId `
    --timeout=300s

# Get service endpoint
Write-Host "[6/6] Retrieving service endpoint..." -ForegroundColor Yellow
$serviceIp = kubectl get service "bitb-rag-$TenantId-service" `
    --namespace=$namespace `
    -o jsonpath='{.status.loadBalancer.ingress[0].ip}'

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Tenant Provisioning Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Tenant ID:        $TenantId" -ForegroundColor Cyan
Write-Host "Namespace:        $namespace" -ForegroundColor Cyan
Write-Host "Service Endpoint: $serviceIp" -ForegroundColor Cyan
Write-Host ""
Write-Host "To view tenant resources:" -ForegroundColor Yellow
Write-Host "  kubectl get all -n $namespace" -ForegroundColor White
Write-Host ""
Write-Host "To view logs:" -ForegroundColor Yellow
Write-Host "  kubectl logs -n $namespace -l tenant_id=$TenantId -f" -ForegroundColor White
Write-Host ""
Write-Host "To delete tenant:" -ForegroundColor Yellow
Write-Host "  kubectl delete namespace $namespace" -ForegroundColor White
Write-Host ""
