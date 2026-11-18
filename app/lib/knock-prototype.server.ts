// PROTOTYPE — throwaway spike for "Does Knock hold up against Cadence?" (issue #41).
// Lives on the prototype/knock-spike branch only. Never merge.
import Knock, { signUserToken } from "@knocklabs/node";
import { and, desc, eq, isNotNull, isNull, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db } from "~/db";
import { comments, courses, enrollments, lessons, users } from "~/db/schema";

export const knock = new Knock({ apiKey: process.env.KNOCK_SECRET_API_KEY });

export const knockClientConfig = () => ({
  publicKey: process.env.KNOCK_PUBLIC_API_KEY!,
  feedChannelId: process.env.KNOCK_FEED_CHANNEL_ID!,
});

export async function identify(userId: number) {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) throw new Error(`No Cadence user ${userId}`);
  await knock.users.update(String(user.id), {
    name: user.name,
    email: user.email,
  });
  return user;
}

export function signTokenFor(userId: number) {
  return signUserToken(String(userId), {
    signingKey: process.env.KNOCK_SIGNING_KEY,
    expiresInSeconds: 60 * 60,
  });
}

// A real Discussion Reply from the seed data whose author isn't the question author.
export function findDiscussionReply() {
  const question = alias(comments, "question");
  const replier = alias(users, "replier");
  const author = alias(users, "author");
  return db
    .select({
      replyId: comments.id,
      replyBody: comments.body,
      lessonId: lessons.id,
      lessonTitle: lessons.title,
      replierId: replier.id,
      replierName: replier.name,
      questionAuthorId: author.id,
      questionAuthorName: author.name,
    })
    .from(comments)
    .innerJoin(question, eq(comments.parentId, question.id))
    .innerJoin(replier, eq(comments.userId, replier.id))
    .innerJoin(author, eq(question.userId, author.id))
    .innerJoin(lessons, eq(comments.lessonId, lessons.id))
    .where(
      and(
        isNotNull(comments.parentId),
        isNull(comments.deletedAt),
        ne(comments.userId, question.userId)
      )
    )
    .orderBy(desc(comments.id))
    .limit(1)
    .get();
}

// A real Enrollment, for the off-by-default "new Enrollment → Instructor" entry.
export function findEnrollment() {
  const student = alias(users, "student");
  const instructor = alias(users, "instructor");
  return db
    .select({
      enrollmentId: enrollments.id,
      courseTitle: courses.title,
      studentId: student.id,
      studentName: student.name,
      instructorId: instructor.id,
      instructorName: instructor.name,
    })
    .from(enrollments)
    .innerJoin(courses, eq(enrollments.courseId, courses.id))
    .innerJoin(student, eq(enrollments.userId, student.id))
    .innerJoin(instructor, eq(courses.instructorId, instructor.id))
    .orderBy(desc(enrollments.id))
    .limit(1)
    .get();
}
