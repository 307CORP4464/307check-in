<?php
require_once 'config.php';
require_once 'vendor/autoload.php'; // For PhpSpreadsheet

use PhpOffice\PhpSpreadsheet\IOFactory;

header('Content-Type: application/json');

$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

// Clean up old appointments (older than 7 days)
function cleanOldAppointments($conn) {
    $stmt = $conn->prepare("DELETE FROM appointments WHERE scheduled_date < DATE_SUB(CURDATE(), INTERVAL 7 DAY)");
    $stmt->execute();
}

// Get appointments for a specific date
if ($method === 'GET' && $action === 'list') {
    cleanOldAppointments($conn);
    
    $date = $_GET['date'] ?? date('Y-m-d');
    
    $stmt = $conn->prepare("
        SELECT 
            id,
            scheduled_date,
            scheduled_time,
            sales_order,
            delivery,
            source
        FROM appointments 
        WHERE scheduled_date = ?
        ORDER BY 
            CASE scheduled_time
                WHEN '08:00' THEN 1
                WHEN '09:00' THEN 2
                WHEN '09:30' THEN 3
                WHEN '10:00' THEN 4
                WHEN '10:30' THEN 5
                WHEN '11:00' THEN 6
                WHEN '12:30' THEN 7
                WHEN '13:00' THEN 8
                WHEN '13:30' THEN 9
                WHEN '14:00' THEN 10
                WHEN '14:30' THEN 11
                WHEN '15:00' THEN 12
                WHEN '15:30' THEN 13
                WHEN 'Work In' THEN 14
                ELSE 15
            END,
            sales_order
    ");
    $stmt->bind_param("s", $date);
    $stmt->execute();
    $result = $stmt->get_result();
    
    $appointments = [];
    while ($row = $result->fetch_assoc()) {
        $appointments[] = $row;
    }
    
    echo json_encode(['success' => true, 'appointments' => $appointments]);
    exit;
}

// Get appointment count by time slot
if ($method === 'GET' && $action === 'counts') {
    $date = $_GET['date'] ?? date('Y-m-d');
    
    $stmt = $conn->prepare("
        SELECT 
            scheduled_time,
            COUNT(*) as count
        FROM appointments 
        WHERE scheduled_date = ?
        GROUP BY scheduled_time
    ");
    $stmt->bind_param("s", $date);
    $stmt->execute();
    $result = $stmt->get_result();
    
    $counts = [];
    while ($row = $result->fetch_assoc()) {
        $counts[$row['scheduled_time']] = $row['count'];
    }
    
    echo json_encode(['success' => true, 'counts' => $counts]);
    exit;
}

// Find appointment by reference (sales order or delivery)
if ($method === 'GET' && $action === 'find') {
    $reference = $_GET['reference'] ?? '';
    
    $stmt = $conn->prepare("
        SELECT 
            id,
            scheduled_date,
            scheduled_time,
            sales_order,
            delivery
        FROM appointments 
        WHERE (sales_order = ? OR delivery = ?)
        AND scheduled_date >= CURDATE()
        ORDER BY scheduled_date, scheduled_time
        LIMIT 1
    ");
    $stmt->bind_param("ss", $reference, $reference);
    $stmt->execute();
    $result = $stmt->get_result();
    
    if ($row = $result->fetch_assoc()) {
        echo json_encode(['success' => true, 'appointment' => $row]);
    } else {
        echo json_encode(['success' => false, 'message' => 'No appointment found']);
    }
    exit;
}

// Upload Excel file
if ($method === 'POST' && $action === 'upload') {
    if (!isset($_FILES['file'])) {
        echo json_encode(['success' => false, 'message' => 'No file uploaded']);
        exit;
    }
    
    $file = $_FILES['file']['tmp_name'];
    
    try {
        $spreadsheet = IOFactory::load($file);
        $sheet = $spreadsheet->getActiveSheet();
        $highestRow = $sheet->getHighestRow();
        
        $imported = 0;
        $errors = [];
        
        $conn->begin_transaction();
        
        for ($row = 2; $row <= $highestRow; $row++) {
            $date = $sheet->getCell('A' . $row)->getValue();
            $time = $sheet->getCell('B' . $row)->getValue();
            $salesOrder = $sheet->getCell('C' . $row)->getValue();
            $delivery = $sheet->getCell('D' . $row)->getValue();
            
            // Parse date
            if (is_numeric($date)) {
                $date = \PhpOffice\PhpSpreadsheet\Shared\Date::excelToDateTimeObject($date)->format('Y-m-d');
            } else {
                $date = date('Y-m-d', strtotime($date));
            }
            
            // Parse time to our format
            if (is_numeric($time)) {
                $timeObj = \PhpOffice\PhpSpreadsheet\Shared\Date::excelToDateTimeObject($time);
                $timeStr = $timeObj->format('H:i');
            } else {
                $timeStr = date('H:i', strtotime($time));
            }
            
            // Convert to our time slot format
            $timeSlot = str_replace(':', '', $timeStr);
            if (strlen($timeSlot) == 3) {
                $timeSlot = '0' . $timeSlot;
            }
            
            // Check if appointment already exists
            $checkStmt = $conn->prepare("
                SELECT id FROM appointments 
                WHERE scheduled_date = ? 
                AND scheduled_time = ? 
                AND sales_order = ? 
                AND delivery = ?
            ");
            $checkStmt->bind_param("ssss", $date, $timeSlot, $salesOrder, $delivery);
            $checkStmt->execute();
            $exists = $checkStmt->get_result()->num_rows > 0;
            
            if (!$exists) {
                $stmt = $conn->prepare("
                    INSERT INTO appointments (scheduled_date, scheduled_time, sales_order, delivery, source)
                    VALUES (?, ?, ?, ?, 'excel')
                ");
                $stmt->bind_param("ssss", $date, $timeSlot, $salesOrder, $delivery);
                
                if ($stmt->execute()) {
                    $imported++;
                } else {
                    $errors[] = "Row $row: " . $stmt->error;
                }
            }
        }
        
        $conn->commit();
        
        echo json_encode([
            'success' => true, 
            'imported' => $imported,
            'errors' => $errors
        ]);
        
    } catch (Exception $e) {
        $conn->rollback();
        echo json_encode(['success' => false, 'message' => $e->getMessage()]);
    }
    exit;
}

// Create manual appointment
if ($method === 'POST' && $action === 'create') {
    $data = json_decode(file_get_contents('php://input'), true);
    
    $stmt = $conn->prepare("
        INSERT INTO appointments (scheduled_date, scheduled_time, sales_order, delivery, source)
        VALUES (?, ?, ?, ?, 'manual')
    ");
    $stmt->bind_param("ssss", 
        $data['scheduled_date'], 
        $data['scheduled_time'], 
        $data['sales_order'], 
        $data['delivery']
    );
    
    if ($stmt->execute()) {
        echo json_encode(['success' => true, 'id' => $conn->insert_id]);
    } else {
        echo json_encode(['success' => false, 'message' => $stmt->error]);
    }
    exit;
}

// Update manual appointment
if ($method === 'PUT' && $action === 'update') {
    $data = json_decode(file_get_contents('php://input'), true);
    
    // Only allow updating manual appointments
    $stmt = $conn->prepare("
        UPDATE appointments 
        SET scheduled_date = ?, 
            scheduled_time = ?, 
            sales_order = ?, 
            delivery = ?
        WHERE id = ? AND source = 'manual'
    ");
    $stmt->bind_param("ssssi", 
        $data['scheduled_date'], 
        $data['scheduled_time'], 
        $data['sales_order'], 
        $data['delivery'],
        $data['id']
    );
    
    if ($stmt->execute() && $stmt->affected_rows > 0) {
        echo json_encode(['success' => true]);
    } else {
        echo json_encode(['success' => false, 'message' => 'Cannot update Excel-imported appointments or appointment not found']);
    }
    exit;
}

// Delete manual appointment
if ($method === 'DELETE' && $action === 'delete') {
    $id = $_GET['id'] ?? 0;
    
    // Only allow deleting manual appointments
    $stmt = $conn->prepare("DELETE FROM appointments WHERE id = ? AND source = 'manual'");
    $stmt->bind_param("i", $id);
    
    if ($stmt->execute() && $stmt->affected_rows > 0) {
        echo json_encode(['success' => true]);
    } else {
        echo json_encode(['success' => false, 'message' => 'Cannot delete Excel-imported appointments or appointment not found']);
    }
    exit;
}

echo json_encode(['success' => false, 'message' => 'Invalid request']);
?>
