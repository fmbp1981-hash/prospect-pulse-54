# Script PowerShell para testar Evolution API
# Substitua as variáveis abaixo com suas credenciais

$EVOLUTION_API_URL = "https://www.intellixai.com.br/instance/WA-Pessoal"
$EVOLUTION_API_KEY = "429683C4C977415CAAFCCE10F7D57E11"
$TEST_NUMBER = "5511999999999"  # Número de teste (substitua por um número real se quiser)

Write-Host "🔍 Testando Evolution API..." -ForegroundColor Cyan
Write-Host "URL: $EVOLUTION_API_URL/checkNumber"
Write-Host "Número de teste: $TEST_NUMBER"
Write-Host ""

# Preparar headers e body
$headers = @{
    "Content-Type" = "application/json"
    "apikey" = $EVOLUTION_API_KEY
}

$body = @{
    number = $TEST_NUMBER
} | ConvertTo-Json

# Fazer requisição
try {
    Write-Host "Enviando requisição..." -ForegroundColor Yellow

    $response = Invoke-RestMethod `
        -Uri "$EVOLUTION_API_URL/checkNumber" `
        -Method Post `
        -Headers $headers `
        -Body $body `
        -ErrorAction Stop

    Write-Host ""
    Write-Host "✅ Sucesso!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Resposta:" -ForegroundColor Cyan
    $response | ConvertTo-Json -Depth 10 | Write-Host

    if ($response.exists -eq $true -or $response.onWhatsApp -eq $true) {
        Write-Host ""
        Write-Host "✅ Número TEM WhatsApp" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "❌ Número NÃO TEM WhatsApp" -ForegroundColor Red
    }

} catch {
    Write-Host ""
    Write-Host "❌ Erro na requisição!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Status: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Yellow
    Write-Host "Mensagem: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host ""

    # Diagnóstico
    Write-Host "Possíveis causas:" -ForegroundColor Cyan

    $statusCode = $_.Exception.Response.StatusCode.value__

    switch ($statusCode) {
        401 { Write-Host "- API Key inválida ou expirada" -ForegroundColor Yellow }
        403 { Write-Host "- Sem permissão para acessar este endpoint" -ForegroundColor Yellow }
        404 { Write-Host "- URL incorreta ou instância não encontrada" -ForegroundColor Yellow }
        500 { Write-Host "- Erro interno no servidor Evolution API" -ForegroundColor Yellow }
        default { Write-Host "- Erro desconhecido (código $statusCode)" -ForegroundColor Yellow }
    }
}

Write-Host ""
Write-Host "📖 Resultado esperado:" -ForegroundColor Cyan
Write-Host "- HTTP Status: 200 ou 201 (sucesso)"
Write-Host "- Resposta JSON: {`"exists`": true/false, `"jid`": `"...`"}"
