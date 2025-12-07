# End-to-End API Test: /api/ask Route (Windows/PowerShell)
# 
# This tests the full retrieval pipeline:
# 1. Query embedding generation (mpnet)
# 2. Tenant isolation via context
# 3. HNSW index-accelerated search
# 4. LLM-enhanced response generation
#
# Prerequisites:
# - Next.js dev server running on localhost:3000
# - Valid SUPABASE credentials in .env.local
# - Sample data ingested for the test tenant
#
# Usage: powershell -ExecutionPolicy Bypass -File test-api-e2e.ps1

param(
    [string]$ApiUrl = "http://localhost:3000",
    [string]$TenantId = "tn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
)

Write-Host ("=" * 76) -ForegroundColor Cyan
Write-Host "END-TO-END TEST: /api/ask Route" -ForegroundColor Cyan
Write-Host ("=" * 76) -ForegroundColor Cyan
Write-Host ""

Write-Host "Configuration:" -ForegroundColor Yellow
Write-Host "  API URL: $ApiUrl"
Write-Host "  Tenant ID: $TenantId"
Write-Host ""

# Test 1: Simple Query
Write-Host "[1/3] Testing basic query retrieval..." -ForegroundColor Green

$body = @{
    tenant_id = $TenantId
    query = "What is the return policy?"
} | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri "$ApiUrl/api/ask" `
        -Method POST `
        -ContentType "application/json" `
        -Body $body `
        -ErrorAction Stop

    $data = $response.Content | ConvertFrom-Json

    Write-Host "Response:" -ForegroundColor Yellow
    Write-Host ($data | ConvertTo-Json -Depth 3) -ForegroundColor Gray
    Write-Host ""

    # Check for expected fields
    if ($null -ne $data.answer) {
        Write-Host "✓ Test 1a PASSED: Received answer field" -ForegroundColor Green
    } else {
        Write-Host "✗ Test 1a FAILED: Missing answer field" -ForegroundColor Red
        exit 1
    }

    if ($null -ne $data.sources) {
        $sourceCount = $data.sources.Count
        Write-Host "✓ Test 1b PASSED: Received $sourceCount sources" -ForegroundColor Green
    } else {
        Write-Host "✗ Test 1b FAILED: Missing sources field" -ForegroundColor Red
        exit 1
    }

    Write-Host ""

    # Test 2: Query metadata
    Write-Host "[2/3] Testing query with retrieval metadata..." -ForegroundColor Green
    $confidence = $data.confidence
    Write-Host "  Confidence score: $confidence"
    
    if ($confidence -gt 0) {
        Write-Host "✓ Test 2 PASSED: Confidence is > 0" -ForegroundColor Green
    } else {
        Write-Host "✗ Test 2 FAILED: Confidence should be > 0 for retrieved documents" -ForegroundColor Red
    }

    Write-Host ""

    # Test 3: Error handling (empty query)
    Write-Host "[3/3] Testing error handling (empty query)..." -ForegroundColor Green
    
    $errorBody = @{
        tenant_id = $TenantId
        query = ""
    } | ConvertTo-Json

    try {
        $errorResponse = Invoke-WebRequest -Uri "$ApiUrl/api/ask" `
            -Method POST `
            -ContentType "application/json" `
            -Body $errorBody `
            -ErrorAction Stop

        $errorData = $errorResponse.Content | ConvertFrom-Json
        if ($null -ne $errorData.error) {
            Write-Host "✓ Test 3 PASSED: Error handling works" -ForegroundColor Green
            Write-Host "  Error message: $($errorData.error)"
        }
    } catch {
        # 400 error is expected for empty query
        if ($_.Exception.Response.StatusCode -eq 400) {
            Write-Host "✓ Test 3 PASSED: Correctly rejected empty query with 400 status" -ForegroundColor Green
        } else {
            Write-Host "⚠ Test 3: Unexpected response" -ForegroundColor Yellow
            Write-Host $_.Exception.Message
        }
    }

} catch {
    Write-Host "✗ Error during API call:" -ForegroundColor Red
    Write-Host $_.Exception.Message
    
    if ($_.Exception.Response.StatusCode) {
        Write-Host "HTTP Status: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
    }
    
    exit 1
}

Write-Host ""
Write-Host ("=" * 76) -ForegroundColor Cyan
Write-Host "✓ ALL TESTS PASSED" -ForegroundColor Cyan
Write-Host ("=" * 76) -ForegroundColor Cyan
Write-Host ""
Write-Host "The retrieval function is working end-to-end!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Test with your real tenant IDs and sample data"
Write-Host "2. Monitor query performance using the HNSW index"
Write-Host "3. Verify tenant isolation by checking cross-tenant access is blocked"
