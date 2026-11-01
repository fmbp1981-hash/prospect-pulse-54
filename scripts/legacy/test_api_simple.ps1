$url = "https://www.intellixai.com.br/instance/WA-Pessoal/checkNumber"
$apiKey = "429683C4C977415CAAFCCE10F7D57E11"
$number = "5511999999999"

Write-Host "Testing Evolution API..."
Write-Host "URL: $url"

$headers = @{
    "Content-Type" = "application/json"
    "apikey" = $apiKey
}

$body = @{
    number = $number
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri $url -Method Post -Headers $headers -Body $body -ErrorAction Stop
    Write-Host ""
    Write-Host "SUCCESS!" -ForegroundColor Green
    Write-Host "Response:"
    $response | ConvertTo-Json -Depth 10
} catch {
    Write-Host ""
    Write-Host "ERROR!" -ForegroundColor Red
    Write-Host "Status Code: $($_.Exception.Response.StatusCode.value__)"
    Write-Host "Message: $($_.Exception.Message)"
}
