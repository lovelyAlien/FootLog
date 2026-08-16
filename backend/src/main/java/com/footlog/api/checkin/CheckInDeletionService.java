package com.footlog.api.checkin;

import com.footlog.api.checkinnote.CheckInNote;
import com.footlog.api.checkinnote.CheckInNoteRepository;
import com.footlog.api.photo.ObjectStorageClient;
import com.footlog.api.photo.PhotoAttachment;
import com.footlog.api.photo.PhotoAttachmentRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class CheckInDeletionService {

  private final CheckInRepository checkInRepository;
  private final CheckInNoteRepository checkInNoteRepository;
  private final PhotoAttachmentRepository photoAttachmentRepository;
  private final ObjectStorageClient objectStorageClient;

  public CheckInDeletionService(CheckInRepository checkInRepository,
                                 CheckInNoteRepository checkInNoteRepository,
                                 PhotoAttachmentRepository photoAttachmentRepository,
                                 ObjectStorageClient objectStorageClient) {
    this.checkInRepository = checkInRepository;
    this.checkInNoteRepository = checkInNoteRepository;
    this.photoAttachmentRepository = photoAttachmentRepository;
    this.objectStorageClient = objectStorageClient;
  }

  @Transactional
  public void deleteCascading(UUID userId, UUID checkInId, Instant deletedAt) {
    boolean ownedAndActive = checkInRepository.findById(checkInId)
        .filter(c -> c.userId().equals(userId) && c.deletedAt() == null)
        .isPresent();
    if (!ownedAndActive) {
      return;
    }

    List<PhotoAttachment> activePhotos = photoAttachmentRepository.findAllActiveByCheckInId(checkInId);
    for (PhotoAttachment photo : activePhotos) {
      objectStorageClient.delete(photo.objectKey());
      photoAttachmentRepository.delete(userId, photo.id(), deletedAt);
    }

    Optional<CheckInNote> activeNote = checkInNoteRepository.findActiveByCheckInId(checkInId);
    if (activeNote.isPresent()) {
      checkInNoteRepository.delete(userId, activeNote.get().id(), deletedAt);
    }

    checkInRepository.softDelete(userId, checkInId, deletedAt);
  }
}
