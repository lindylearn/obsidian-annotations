import type { LocalHighlight } from '~/models';
import { excludedTags } from '~/parser/parseSyncResponse';


export const parseFilePageNote = (text: string): LocalHighlight => {
    const pageNoteSection = getFileSection(text, "## Page Note");
    if (!pageNoteSection) {
        return null;
    }

    let tags = [];
    const lines = pageNoteSection.trim().split("\n");
    if (lines[lines.length - 1].startsWith("#")) {
        let tagsText = lines.pop();
        tags = parseTagsLine(tagsText)
    }
    
    const cleanText = lines.join("\n")
    
    return {
        id: "",
        // updated: string;
        text: null,
        annotation: cleanText,
        tags,
    }
}

export const parseFileAnnotations = (text: string): LocalHighlight[] => {
    const annotationsSection = getFileSection(text, "## Annotations")
    const annotations = annotationsSection
        .split("\n\n")
        .map(t => t.trim())
        .filter(t => t.startsWith(">"))
        .map(parseAnnotationText)

    return annotations;
}

const getFileSection = (text: string, header: string): string => {
    const sectionStart = text.indexOf(header)
    if (sectionStart === -1) {
        return null
    }
    let sectionEnd = text.indexOf("## ", sectionStart + header.length);
    if (sectionEnd === -1) {
        sectionEnd = text.length - 1;
    }

    return text
        .slice(sectionStart, sectionEnd)
        .replace(header, "")
        .trim();
}

const parseAnnotationText = (text: string): LocalHighlight => {
    let quoteText = "";
    let annotationId: string = null;
    let noteBulletPoints: string[] = [];
    let tags: string[] = [];
    for (const line of text.split("\n")) {
        if (line.startsWith(">")) {
            quoteText += line.replace("> ", "")

            // Find annotation links in quote text
            // e.g. "https://hyp.is/zz9bmo38EeycBb9EDKiNlA/www.vox.com/future-perfect/2019/4/4/18295933/google-cancels-ai-ethics-board#zc87bo5BEeyfugviFgzJHg"
            const match = /https\:\/\/hyp.is\/(?<threadId>[^\/]+)\/(?<url>.*)#(?<annotationId>[^\/ )]+)/g.exec(line)
            if (!match) {
                console.error(`Found annotation without valid id link: ${text}`)
                return null;
            }
            annotationId = match.groups.annotationId;
        } else if (line.startsWith("- ") || line.startsWith("* ")) {
            const lineText = line
                .slice(2) // bullet point styling
                .replace("\n", ""); // linebreak at end
             
            noteBulletPoints.push(lineText);
        }
    }
    
    if (noteBulletPoints[noteBulletPoints.length - 1]?.startsWith("#")) {
        let tagsText = noteBulletPoints
            .pop()
            .trim();

        tags = parseTagsLine(tagsText);
    }

    // Only assume one annotation without replies for now
    const annotationText = noteBulletPoints.join("\n\n")

    return {
        id: annotationId,
        // updated: string;
        text: quoteText,
        annotation: annotationText,
        tags,
    }
}

const parseTagsLine = (line: string): string[] => {
    return line
        .split("#")
        .map(t => t.trim())
        .filter(t => t)
        .filter(tag => !excludedTags.includes(tag))
}
