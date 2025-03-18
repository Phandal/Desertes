import { type Document, type Segment, X12Parser } from './parser.js';
import type {
	ContainerSegmentRule,
	Deserializer,
	EDIObject,
	EDISegment,
	SegmentRule,
	StandardSegmentRule,
	Template,
} from './types.js';

export class X12Deserializer implements Deserializer {
	input: string;
	template: Template;
	private tree: Document | undefined = undefined;

	constructor(input: string, template: Template) {
		this.input = input;
		this.template = template;
	}

	deserialize(): EDIObject {
		const parser = new X12Parser({
			elementSeparator: this.template.elementSeparator,
			segmentSeparator: this.template.segmentSeparator,
			componentSeparator: this.template.componentSeparator,
			repetitionSeparator: this.template.repetitionSeparator,
			input: this.input,
		});

		this.tree = parser.parse();

		let obj: EDIObject = {};
		let currentRowCount = 0;

		while (this.tree.hasNextSegment()) {
			for (const rule of this.template.rules) {
				if (
					rule.numberOfRowsToSkip &&
					rule.numberOfRowsToSkip > currentRowCount
				) {
					// Advance the tree to skip the row
					this.tree.nextSegment();
					++currentRowCount;
					continue;
				}
				obj = this.deserializeSegment(obj, this.tree.nextSegment(), rule);
			}
		}

		return obj;
	}

	private deserializeSegment(
		obj: EDIObject,
		segment: Segment | null,
		rule: SegmentRule,
	): EDIObject {
		if (!segment) {
			return obj;
		}

		if (!rule.container) {
			obj = this.deserializeStandardSegment(obj, segment, rule);
		} else {
			obj = this.deserializeContainerSegment(obj, segment, rule);
		}

		return obj;
	}

	private deserializeStandardSegment(
		obj: EDIObject,
		segment: Segment,
		standardRule: StandardSegmentRule,
	): EDIObject {
		let tempSeg: EDISegment = {};
		for (const element of standardRule.elements) {
			const value = segment.nextElement()?.value;
			tempSeg[element.name] = value;
		}

		const childObj: EDIObject = {};

		if (standardRule.children) {
			for (const child of standardRule.children) {
				if (!this.tree?.hasNextSegment()) {
					break;
				}
				let segNode = this.tree.nextSegment();
				this.deserializeSegment(childObj, segNode, child);
				tempSeg = this.addChildSegment(tempSeg, childObj);
				segNode = this.tree?.nextSegment();
			}
		}

		obj = this.addSegment(obj, standardRule.name, tempSeg);
		return obj;
	}

	private deserializeContainerSegment(
		obj: EDIObject,
		segment: Segment,
		containerRule: ContainerSegmentRule,
	): EDIObject {
		let tempSeg: EDISegment = {};
		const container: EDIObject[] = [];
		let segNode: Segment | null | undefined = segment;

		for (const child of containerRule.children) {
			if (!segNode) {
				break;
			}

			container.push(this.deserializeSegment({}, segNode, child));
			segNode = this.tree?.nextSegment();
		}

		tempSeg = this.addContainer(tempSeg, container);
		obj = this.addSegment(obj, containerRule.name, tempSeg);
		return obj;
	}

	private addSegment(
		obj: EDIObject,
		header: string,
		seg: EDISegment,
	): EDIObject {
		if (obj[header]) {
			obj[header].push(seg);
		} else {
			obj[header] = [seg];
		}

		return obj;
	}

	private addChildSegment(seg: EDISegment, childSeg: EDIObject): EDISegment {
		Object.assign(seg, childSeg);

		return seg;
	}

	private addContainer(seg: EDISegment, container: EDIObject[]): EDISegment {
		container.forEach((ediObject) => {
			seg = this.addChildSegment(seg, ediObject);
		});

		return seg;
	}
}
