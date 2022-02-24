import type { Article, Highlights, LocalHighlight } from '~/models';
import { excludedTags } from '~/parser/parseSyncResponse';


export const parseFileAnnotations = (text: string): LocalHighlight[] => {
    const annotationsSectionStart = text.indexOf("## Annotations")
    if (annotationsSectionStart === -1) {
        return []
    }
    const annotationsSection = text
        .slice(annotationsSectionStart, text.length - 1)
        .replace("## Annotations", "")

    const annotations = annotationsSection
        .split("\n\n")
        .map(t => t.trim())
        .filter(t => t.startsWith(">"))
        .map(parseAnnotationText)


    return annotations;
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
            // e.g. "https://hyp.is/l-HHlmy 0EeyuWtc5XiTWGQ/www.paulgraham.com/venturecapital.html"
            annotationId = /https\:\/\/hyp.is\/([^\/]+)\//g.exec(line)?.[1]
        } else if (line.startsWith("- ") || line.startsWith("* ")) {
            const lineText = line
                .slice(2) // bullet point styling
                .replace("\n", "") // linebreak at end
                .trim();
             
            noteBulletPoints.push(lineText);
        }
    }
    
    if (noteBulletPoints[noteBulletPoints.length - 1]?.startsWith("#")) {
        let tagsText = noteBulletPoints
            .pop()
            .trim()

        tags = tagsText
            .split("#")
            .map(t => t.trim())
            .filter(t => t)
            .filter(tag => !excludedTags.includes(tag))
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
